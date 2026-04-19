import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { collection, addDoc, doc, updateDoc, query, where, getDocs, limit, orderBy, serverTimestamp } from 'firebase/firestore';
import { Plus, Minus, Trash2, Save, CheckCircle2, AlertTriangle, AlertCircle, ChevronRight, ChevronDown, LayoutGrid, Scissors, Activity, Search } from 'lucide-react';
import { Button, Card, CardHeader, CardTitle, CardContent, Input, Select, Badge, Label } from './ui/Base';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './ui/Tabs';
import { Section, ReportType, Defect, UserSettings, DhuReport, RftReport, NeedlePointAnalysis, CuttingReport, CriticalProcess, DayFinalReport } from '../types';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { SEWING_DEFECTS, CUTTING_DEFECTS, HOUR_SLOTS, LINES, FLOORS } from '../constants';
import { handleFirestoreError, OperationType } from '../lib/firestore-errors';

interface DataEntryProps {
  user: User;
  settings: UserSettings | null;
  onSettingsUpdate: (s: UserSettings) => void;
  userProfile?: import('../types').UserProfile | null;
}

export default function DataEntry({ user, settings, onSettingsUpdate, userProfile }: DataEntryProps) {
  const [activeSection, setActiveSection] = useState<Section>('Sewing');
  const [reportType, setReportType] = useState<ReportType>('DHU');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form States
  const [formData, setFormData] = useState({
    date: format(new Date(), 'yyyy-MM-dd'),
    hourSlot: HOUR_SLOTS[0],
    floor: settings?.lastFloor || '',
    line: (userProfile?.role === 'entry' ? userProfile.assignedLine : settings?.lastLine) || '',
    buyer: settings?.lastBuyer || '',
    style: settings?.lastStyle || '',
    color: settings?.lastColor || '',
    operationName: '',
    operatorName: '',
    operatorId: '',
    tableType: 'All table',
    totalReceiveQty: 0,
    totalCheckQty: 0,
    qcPassQty: 0,
    outputQty: 0,
    defectiveQty: 0,
    rectifyQty: 0,
    analysisName: '',
    totalQcPassQty: 0,
    checkQty20: 0,
    status: 'Pass' as 'Pass' | 'Fail',
    findings: '',
    remark: '',
  });

  const [defects, setDefects] = useState<Defect[]>([]);
  const [criticalProcesses, setCriticalProcesses] = useState<CriticalProcess[]>([
    { name: '', operatorName: '', operatorId: '', trainingStatus: '', checkQty: 0, defectQty: 0 }
  ]);
  const [setupForm, setSetupForm] = useState({ operationName: '', operatorName: '', operatorId: '', table: '' });
  const [editingSetup, setEditingSetup] = useState<string | null>(null);

  // Calculations
  const totalDefects = useMemo(() => {
    return defects.reduce((sum, d) => sum + (d.qty || 0), 0);
  }, [defects, reportType]);

  const totalCriticalCheck = useMemo(() => criticalProcesses.reduce((sum, p) => sum + p.checkQty, 0), [criticalProcesses]);
  const totalCriticalDefects = useMemo(() => criticalProcesses.reduce((sum, p) => sum + p.defectQty, 0), [criticalProcesses]);

  const dhuPercent = useMemo(() => {
    if (formData.totalCheckQty === 0) return 0;
    return (totalDefects / formData.totalCheckQty) * 100;
  }, [totalDefects, formData.totalCheckQty]);

  const rftPercent = useMemo(() => {
    if (formData.totalCheckQty === 0) return 0;
    return (formData.qcPassQty / formData.totalCheckQty) * 100;
  }, [formData.qcPassQty, formData.totalCheckQty]);

  const needleRftPercent = useMemo(() => {
    if (totalCriticalCheck === 0) return 0;
    return ((totalCriticalCheck - totalCriticalDefects) / totalCriticalCheck) * 100;
  }, [totalCriticalCheck, totalCriticalDefects]);

  // Sync settings
  const [hasRestoredSettings, setHasRestoredSettings] = useState(false);

  useEffect(() => {
    if (settings && !hasRestoredSettings) {
      setFormData(prev => ({
        ...prev,
        floor: settings.lastFloor || prev.floor,
        line: settings.lastLine || prev.line,
        buyer: settings.lastBuyer || prev.buyer,
        style: settings.lastStyle || prev.style,
      }));
      if (settings.lastCriticalProcesses && settings.lastCriticalProcesses.length > 0) {
        // Only restore names/ids/status, reset quantities to 0
        setCriticalProcesses(settings.lastCriticalProcesses.map(p => ({
          ...p,
          checkQty: 0,
          defectQty: 0
        })));
      }
      setHasRestoredSettings(true);
    }
  }, [settings, hasRestoredSettings]);

  // Auto-fill buyer/style/color when line changes
  useEffect(() => {
    if (!formData.line) return;

    // Check settings for lineDefaults first (highest priority for "persistence until manual change")
    if (settings?.lineDefaults?.[formData.line]) {
      const defaults = settings.lineDefaults[formData.line];
      setFormData(prev => ({
        ...prev,
        buyer: defaults.buyer || prev.buyer,
        style: defaults.style || prev.style,
        color: defaults.color || prev.color,
        floor: defaults.floor || prev.floor,
      }));
      return;
    }

    const fetchLastEntry = async () => {
      if (!formData.line || !user) return;

      const collections = ['dhuReports', 'rftReports', 'needlePointAnalyses', 'dayFinalReports'];
      let lastEntry = null;

      for (const coll of collections) {
        try {
          // First try today
          const qToday = query(
            collection(db, coll),
            where('line', '==', formData.line),
            where('date', '==', formData.date),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snapToday = await getDocs(qToday);
          if (!snapToday.empty) {
            lastEntry = snapToday.docs[0].data();
            break;
          }

          // If not today, try most recent ever
          const qRecent = query(
            collection(db, coll),
            where('line', '==', formData.line),
            orderBy('date', 'desc'),
            orderBy('createdAt', 'desc'),
            limit(1)
          );
          const snapRecent = await getDocs(qRecent);
          if (!snapRecent.empty) {
            lastEntry = snapRecent.docs[0].data();
            break;
          }
        } catch (err) {
          console.warn(`Failed to fetch last entry from ${coll}:`, err);
        }
      }

      if (lastEntry) {
        setFormData(prev => ({
          ...prev,
          buyer: lastEntry.buyer || prev.buyer,
          style: lastEntry.style || prev.style,
          color: lastEntry.color || prev.color,
          floor: lastEntry.floor || prev.floor,
        }));
      }
    };

    fetchLastEntry();
  }, [formData.line, formData.date, user, settings?.lineDefaults]);

  // Auto-fill RFT data from DHU reports
  useEffect(() => {
    const syncRftData = async () => {
      if (reportType !== 'RFT' || !formData.date || !formData.line || !formData.buyer || !formData.style) return;

      try {
        const q = query(
          collection(db, 'dhuReports'),
          where('date', '==', formData.date),
          where('line', '==', formData.line),
          where('buyer', '==', formData.buyer),
          where('style', '==', formData.style)
        );
        const snap = await getDocs(q);
        const dhuReports = snap.docs.map(doc => doc.data() as DhuReport);

        if (dhuReports.length > 0) {
          const outputTableReport = dhuReports.find(r => r.tableType === 'Output table');
          const insideTableReport = dhuReports.find(r => r.tableType === 'Inside table');

          const outputQty = outputTableReport?.totalCheckQty || 0;
          // Sewing QC pass is only from Output Table as per user requirements
          const qcPassQty = outputTableReport?.qcPassQty || 0;
          const defectiveQty = (insideTableReport?.defectiveQty || 0) + (outputTableReport?.defectiveQty || 0);

          setFormData(prev => ({
            ...prev,
            outputQty,
            qcPassQty,
            defectiveQty,
            totalCheckQty: outputQty // RFT check qty is same as output qty
          }));
        }
      } catch (err) {
        console.warn("Failed to sync RFT data from DHU:", err);
      }
    };

    syncRftData();
  }, [reportType, formData.date, formData.line, formData.buyer, formData.style]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target;
    setFormData(prev => {
      const val = type === 'number' ? parseFloat(value) || 0 : value;
      const newData = {
        ...prev,
        [name]: val
      };

      // RFT specific logic: Sync Check Qty with Output Qty and calculate QC Pass Qty
      if (reportType === 'RFT') {
        if (name === 'outputQty') {
          newData.totalCheckQty = val as number;
          newData.qcPassQty = (val as number) - prev.defectiveQty;
        } else if (name === 'defectiveQty') {
          newData.qcPassQty = prev.outputQty - (val as number);
        }
      }

      // Auto-calculate 20% check qty for Day Final
      if (reportType === 'Day Final Report' && name === 'totalQcPassQty') {
        newData.checkQty20 = Math.round(Number(val) * 0.2);
      }

      // Reset line if floor changes
      if (name === 'floor' && value !== prev.floor) {
        newData.line = '';
      }
      return newData;
    });
  };

  const addDefect = (defectName: string) => {
    const existing = defects.find(d => d.name === defectName);
    if (existing) {
      setDefects(defects.map(d => d.name === defectName ? { ...d, qty: d.qty + 1 } : d));
    } else {
      let defaultTable = '';
      if (formData.operationName && settings?.operationOperatorMap?.[formData.operationName]) {
        const opId = settings.operationOperatorMap[formData.operationName];
        const operator = settings.operators?.find(o => o.id === opId);
        if (operator && operator.table) {
          defaultTable = operator.table;
        }
      }

      setDefects([...defects, { 
        name: defectName, 
        qty: 1,
        operation: formData.operationName,
        operatorName: formData.operatorName || 'Unknown',
        operatorId: formData.operatorId || 'N/A',
        tableType: defaultTable
      }]);
    }
  };

  const updateDefect = async (index: number, field: keyof Defect, value: any) => {
    const newDefects = [...defects];
    const defect = { ...newDefects[index], [field]: value };

    // Auto-select operator logic for DHU
    if (field === 'operation' && value && settings) {
      if (settings?.operationOperatorMap?.[value]) {
        const opId = settings.operationOperatorMap[value];
        const operator = settings.operators?.find(o => o.id === opId);
        if (operator) {
          defect.operatorId = opId;
          defect.operatorName = operator.name;
          if (operator.table) {
            defect.tableType = operator.table;
          }
        }
      }
    }

    // Update mapping if operator is changed manually
    if (field === 'operatorId' && defect.operation && value && user && settings) {
      const updatedMap = { ...(settings.operationOperatorMap || {}), [defect.operation]: value };
      const newSettings = { ...settings, operationOperatorMap: updatedMap };
      await updateDoc(doc(db, 'userSettings', user.uid), { operationOperatorMap: updatedMap });
      onSettingsUpdate(newSettings);
    }

    newDefects[index] = defect;
    setDefects(newDefects);
  };

  const addCriticalProcess = () => {
    setCriticalProcesses([...criticalProcesses, { name: '', operatorName: '', operatorId: '', trainingStatus: '', checkQty: 0, defectQty: 0 }]);
  };

  const updateCriticalProcess = (index: number, field: keyof CriticalProcess, value: any) => {
    const newProcesses = [...criticalProcesses];
    newProcesses[index] = { ...newProcesses[index], [field]: value };
    setCriticalProcesses(newProcesses);
  };

  const removeCriticalProcess = (index: number) => {
    setCriticalProcesses(criticalProcesses.filter((_, i) => i !== index));
  };

  const removeDefect = (defectName: string) => {
    const existing = defects.find(d => d.name === defectName);
    if (existing) {
      if (existing.qty > 1) {
        setDefects(defects.map(d => d.name === defectName ? { ...d, qty: d.qty - 1 } : d));
      } else {
        setDefects(defects.filter(d => d.name !== defectName));
      }
    }
  };

  const handleSetupSubmit = async () => {
    if (!setupForm.operationName || !user || !settings) return;
    setLoading(true);
    
    try {
      let updatedOps = [...(settings.operations || [])];
      let updatedOperators = [...(settings.operators || [])];
      let updatedOpMap = { ...(settings.operationOperatorMap || {}) };

      // Add or update operation
      if (editingSetup) {
        updatedOps = updatedOps.map(op => op === editingSetup ? setupForm.operationName : op);
        if (editingSetup !== setupForm.operationName) {
           if (updatedOpMap[editingSetup]) {
             updatedOpMap[setupForm.operationName] = updatedOpMap[editingSetup];
             delete updatedOpMap[editingSetup];
           }
        }
      } else {
        if (!updatedOps.includes(setupForm.operationName)) {
           updatedOps.push(setupForm.operationName);
        } else if (!setupForm.operatorId) {
           setError('Operation already exists');
           setLoading(false);
           return;
        }
      }

      // Add or update operator if ID provided
      if (setupForm.operatorId) {
        const existingOpIndex = updatedOperators.findIndex(o => o.id === setupForm.operatorId);
        const operatorObj = { name: setupForm.operatorName, id: setupForm.operatorId, table: setupForm.table };
        if (existingOpIndex >= 0) {
          updatedOperators[existingOpIndex] = operatorObj;
        } else {
          updatedOperators.push(operatorObj);
        }
        
        // Link them
        updatedOpMap[setupForm.operationName] = setupForm.operatorId;
      }

      const newSettings = { 
        ...settings, 
        operations: updatedOps, 
        operators: updatedOperators, 
        operationOperatorMap: updatedOpMap 
      };

      await updateDoc(doc(db, 'userSettings', user.uid), { 
        operations: updatedOps, 
        operators: updatedOperators, 
        operationOperatorMap: updatedOpMap 
      });

      onSettingsUpdate(newSettings);
      setSetupForm({ operationName: '', operatorName: '', operatorId: '', table: '' });
      setEditingSetup(null);
      setSuccess(`Operation configuration ${editingSetup ? 'updated' : 'added'} successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      console.error("Error managing setup:", err);
      setError(err.message || "Failed to save configuration");
    } finally {
      setLoading(false);
    }
  };

  const deleteSetup = async (opName: string) => {
    if (!user || !settings) return;
    const updatedOps = settings.operations?.filter(op => op !== opName) || [];
    const updatedMap = { ...(settings.operationOperatorMap || {}) };
    delete updatedMap[opName];
    
    const newSettings = { ...settings, operations: updatedOps, operationOperatorMap: updatedMap };
    await updateDoc(doc(db, 'userSettings', user.uid), { 
      operations: updatedOps, 
      operationOperatorMap: updatedMap 
    });
    onSettingsUpdate(newSettings);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const commonData = {
        date: formData.date,
        floor: formData.floor,
        line: formData.line,
        buyer: formData.buyer,
        style: formData.style,
        color: formData.color,
        tableType: formData.tableType,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
      };

        // Save report based on type
        if (activeSection === 'Sewing' || activeSection === 'Template') {
          if (reportType === 'DHU') {
            const finalCheck = formData.totalCheckQty;
            const finalPass = formData.qcPassQty;
            const finalDefective = formData.defectiveQty;
            const finalDefects = defects;
            
            const report: DhuReport = {
              ...commonData,
              operationName: formData.operationName,
              section: activeSection,
              hourSlot: formData.hourSlot,
              totalReceiveQty: formData.totalReceiveQty,
              totalCheckQty: finalCheck,
              qcPassQty: finalPass,
              defectiveQty: finalDefective,
              rectifyQty: formData.rectifyQty,
              defects: finalDefects,
              totalDefects: finalDefects.reduce((acc, d) => acc + (d.qty || 0), 0),
              dhuPercent: finalCheck > 0 ? (finalDefects.reduce((acc, d) => acc + (d.qty || 0), 0) / finalCheck) * 100 : 0,
            };
            try {
              await addDoc(collection(db, 'dhuReports'), report);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'dhuReports');
            }
          } else if (reportType === 'RFT') {
            const report: RftReport = {
              ...commonData,
              operationName: formData.operationName,
              section: activeSection,
              outputQty: formData.outputQty,
              checkQty: formData.totalCheckQty,
              qcPassQty: formData.qcPassQty,
              defectiveQty: formData.defectiveQty,
              rftPercent,
            };
            try {
              await addDoc(collection(db, 'rftReports'), report);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'rftReports');
            }
          } else if (reportType === 'Needle Point Analysis') {
            const report: NeedlePointAnalysis = {
              ...commonData,
              section: activeSection,
              processes: criticalProcesses,
              analysisName: formData.analysisName,
              totalCheckQty: totalCriticalCheck,
              totalDefectQty: totalCriticalDefects,
              rftPercent: needleRftPercent,
            };
            try {
              await addDoc(collection(db, 'needlePointAnalyses'), report);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'needlePointAnalyses');
            }
          } else if (reportType === 'Day Final Report') {
            const report: DayFinalReport = {
              ...commonData,
              section: activeSection,
              totalQcPassQty: formData.totalQcPassQty,
              checkQty20: formData.checkQty20,
              status: formData.status,
              findings: formData.findings,
              remark: formData.remark,
            };
            try {
              await addDoc(collection(db, 'dayFinalReports'), report);
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'dayFinalReports');
            }
          }
        } else if (activeSection === 'Cutting') {
          const report: CuttingReport = {
            ...commonData,
            operationName: formData.operationName,
            floor: formData.floor,
            line: formData.line,
            checkQty: formData.totalCheckQty,
            defectiveQty: formData.defectiveQty,
            rectifyQty: formData.rectifyQty,
            defects: defects.map(d => ({ name: d.name, qty: d.qty })),
            totalDefects,
            dhuPercent,
          };
          try {
            await addDoc(collection(db, 'cuttingReports'), report);
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'cuttingReports');
          }
        }

        // Update settings with last used values and per-line defaults
        const updatedSettings: UserSettings = {
          ...settings,
          lastBuyer: formData.buyer,
          lastStyle: formData.style,
          lastColor: formData.color,
          lastFloor: formData.floor,
          lastLine: formData.line,
          lineDefaults: {
            ...(settings?.lineDefaults || {}),
            [formData.line]: {
              buyer: formData.buyer,
              style: formData.style,
              color: formData.color,
              floor: formData.floor,
            }
          },
          ...(reportType === 'Needle Point Analysis' ? { lastCriticalProcesses: criticalProcesses } : {})
        };
        try {
          await updateDoc(doc(db, 'userSettings', user.uid), updatedSettings as any);
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `userSettings/${user.uid}`);
        }
        onSettingsUpdate(updatedSettings);

      setSuccess('Report saved successfully!');
      setDefects([]);
      if (reportType === 'Needle Point Analysis') {
        setCriticalProcesses(prev => prev.map(p => ({ ...p, checkQty: 0, defectQty: 0 })));
      }
      setFormData(prev => ({
        ...prev,
        totalReceiveQty: 0,
        totalCheckQty: 0,
        qcPassQty: 0,
        outputQty: 0,
        defectiveQty: 0,
        rectifyQty: 0,
        analysisName: '',
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to save report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Section Selection */}
      <div className="grid grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-2xl mb-8">
        {(['Sewing', 'Template', 'Cutting'] as Section[]).map(s => (
          <button
            key={s}
            type="button"
            onClick={() => setActiveSection(s)}
            className={cn(
              "flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-xs font-bold transition-all relative",
              activeSection === s ? "text-white" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
            )}
          >
            {activeSection === s && (
              <motion.div 
                layoutId="activeSection"
                className="absolute inset-0 bg-slate-900 rounded-xl shadow-md -z-0"
              />
            )}
            <span className="relative z-10 flex items-center gap-2">
              {s === 'Sewing' && <Activity className="h-4 w-4" />}
              {s === 'Template' && <LayoutGrid className="h-4 w-4" />}
              {s === 'Cutting' && <Scissors className="h-4 w-4" />}
              {s}
            </span>
          </button>
        ))}
      </div>

      <Card className="shadow-sm border-slate-200 rounded-3xl bg-white overflow-hidden">
        <CardHeader className="border-b border-slate-100 p-6 md:p-8 bg-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="bg-brand-50 p-3 rounded-2xl">
                <Activity className="h-6 w-6 text-brand-600" />
              </div>
              <div>
                <CardTitle className="text-xl font-bold text-slate-900">
                  {activeSection} <span className="text-brand-600">Entry</span>
                </CardTitle>
                <p className="text-xs font-medium text-slate-400 mt-0.5">Fill in the quality inspection details below</p>
              </div>
            </div>
            {activeSection !== 'Cutting' && (
              <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-xl border border-slate-100">
                {(['DHU', 'RFT', 'Needle Point Analysis', 'Day Final Report'] as ReportType[]).map(rt => (
                  <button
                    key={rt}
                    type="button"
                    onClick={() => setReportType(rt)}
                    className={cn(
                      "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all relative",
                      reportType === rt ? "text-brand-600 bg-white shadow-sm" : "text-slate-400 hover:text-slate-600"
                    )}
                  >
                    {rt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 md:p-10">
          <form onSubmit={handleSubmit} className="space-y-8 md:space-y-12">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${activeSection}-${reportType}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="space-y-10"
              >
                {/* Basic Info Grid */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-1 bg-brand-600 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                      Line Information
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Date</Label>
                      <Input type="date" name="date" value={formData.date} onChange={handleInputChange} required className="h-10 bg-white border-slate-200 rounded-lg" />
                    </div>
                    
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Floor</Label>
                      <Select name="floor" value={formData.floor} onChange={handleInputChange} required className="h-10 bg-white border-slate-200 rounded-lg">
                        <option value="">Select Floor</option>
                        <option value="Modhumoti Floor">Modhumoti Floor</option>
                        <option value="Ichamoti Floor">Ichamoti Floor</option>
                      </Select>
                    </div>
                    {activeSection !== 'Cutting' && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">{activeSection === 'Template' ? 'TSU' : 'Line'}</Label>
                        <Select name="line" value={formData.line} onChange={handleInputChange} required className="h-10 bg-white border-slate-200 rounded-lg" disabled={!formData.floor || userProfile?.role === 'entry'}>
                          <option value="">Select {activeSection === 'Template' ? 'TSU' : 'Line'}</option>
                          {formData.floor === 'Modhumoti Floor' && Array.from({ length: 7 }, (_, i) => (
                            <option key={`mdmt-${i}`} value={`Mdmt-${i + 1}`}>Mdmt-{i + 1}</option>
                          ))}
                          {formData.floor === 'Ichamoti Floor' && Array.from({ length: 7 }, (_, i) => (
                            <option key={`icmt-${i}`} value={`Icmt-${i + 1}`}>Icmt-{i + 1}</option>
                          ))}
                        </Select>
                      </div>
                    )}

                    {reportType === 'DHU' && activeSection !== 'Cutting' && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Hour</Label>
                        <Select name="hourSlot" value={formData.hourSlot} onChange={handleInputChange} required className="h-10 bg-white border-slate-200 rounded-lg">
                          {HOUR_SLOTS.map(h => <option key={h} value={h}>{h}</option>)}
                        </Select>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Buyer</Label>
                      <Input type="text" name="buyer" value={formData.buyer} onChange={handleInputChange} placeholder="Buyer" required className="h-10 bg-white border-slate-200 rounded-lg" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Style</Label>
                      <Input type="text" name="style" value={formData.style} onChange={handleInputChange} placeholder="Style" required className="h-10 bg-white border-slate-200 rounded-lg" />
                    </div>
                    <div className="space-y-1.5 text-center sm:text-left">
                      <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Color</Label>
                      <Input type="text" name="color" value={formData.color} onChange={handleInputChange} placeholder="Color" required className="h-10 bg-white border-slate-200 rounded-lg" />
                    </div>

                    {reportType !== 'DHU' && (reportType === 'RFT' || activeSection === 'Cutting') && (
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Operation / Process</Label>
                        <Select name="operationName" value={formData.operationName} onChange={handleInputChange} required className="h-10 bg-white border-slate-200 rounded-lg">
                          <option value="">Select Process</option>
                          {settings?.operations?.map(op => <option key={op} value={op}>{op}</option>)}
                        </Select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Production Qty Grid */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="h-5 w-1 bg-emerald-500 rounded-full" />
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">
                      Production Metrics
                    </h3>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    {reportType === 'DHU' || activeSection === 'Cutting' ? (
                      <>
                        {activeSection !== 'Cutting' && (
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Receive</Label>
                            <Input type="number" name="totalReceiveQty" value={formData.totalReceiveQty} onChange={handleInputChange} className="h-12 text-lg font-bold bg-white rounded-xl border-slate-200 shadow-sm" />
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Check</Label>
                          <Input 
                            type="number" 
                            name="totalCheckQty" 
                            value={formData.totalCheckQty} 
                            onChange={handleInputChange} 
                            required 
                            className="h-12 text-lg font-bold bg-white rounded-xl border-slate-200 shadow-sm"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-emerald-600 uppercase ml-1">QC Pass</Label>
                          <Input 
                            type="number" 
                            name="qcPassQty" 
                            value={formData.qcPassQty} 
                            onChange={handleInputChange} 
                            required 
                            className="h-12 text-lg font-bold bg-white rounded-xl border-emerald-100 shadow-sm text-emerald-600"
                          />
                        </div>
                        {activeSection !== 'Cutting' && (
                          <div className="space-y-1.5">
                            <Label className="text-[10px] font-bold text-amber-600 uppercase ml-1">Defective</Label>
                            <Input 
                              type="number" 
                              name="defectiveQty" 
                              value={formData.defectiveQty} 
                              onChange={handleInputChange} 
                              required 
                              className="h-12 text-lg font-bold bg-white rounded-xl border-amber-100 shadow-sm text-amber-600"
                            />
                          </div>
                        )}
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-blue-600 uppercase ml-1">Rectify Qty</Label>
                          <Input type="number" name="rectifyQty" value={formData.rectifyQty} onChange={handleInputChange} className="h-12 text-lg font-bold bg-white rounded-xl border-blue-100 shadow-sm text-blue-600" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-red-600 uppercase ml-1">Total Defects</Label>
                          <div className="h-12 flex items-center px-4 bg-white border border-red-100 rounded-xl font-bold text-red-600 text-lg shadow-sm">
                            {totalDefects || 0}
                          </div>
                        </div>
                      </>
                    ) : reportType === 'RFT' ? (
                      <>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-brand-600 uppercase ml-1">Output</Label>
                          <Input type="number" name="outputQty" value={formData.outputQty} onChange={handleInputChange} required className="h-12 text-lg font-bold bg-white rounded-xl border-slate-200 shadow-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-600 uppercase ml-1">Defective</Label>
                          <Input type="number" name="defectiveQty" value={formData.defectiveQty} onChange={handleInputChange} required className="h-12 text-lg font-bold bg-white rounded-xl border-amber-100 shadow-sm text-amber-600" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-emerald-600 uppercase ml-1">QC Pass</Label>
                          <div className="h-12 flex items-center px-4 bg-white border border-emerald-100 rounded-xl font-bold text-emerald-600 text-lg shadow-sm">
                            {formData.qcPassQty || 0}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Check</Label>
                          <div className="h-12 flex items-center px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 text-lg shadow-sm">
                            {formData.totalCheckQty || 0}
                          </div>
                        </div>
                      </>
                    ) : reportType === 'Day Final Report' ? (
                      <div className="col-span-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-brand-600 uppercase ml-1">QC Pass</Label>
                          <Input type="number" name="totalQcPassQty" value={formData.totalQcPassQty} onChange={handleInputChange} required className="h-12 text-lg font-bold bg-white rounded-xl border-slate-200 shadow-sm" />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-amber-600 uppercase ml-1">20% Check</Label>
                          <div className="h-12 flex items-center px-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-500 text-lg shadow-sm">
                            {formData.checkQty20 || 0}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-slate-500 uppercase ml-1">Status</Label>
                          <Select name="status" value={formData.status} onChange={handleInputChange} required className="h-12 text-lg font-bold bg-white rounded-xl border-slate-200 shadow-sm">
                            <option value="Pass">Pass</option>
                            <option value="Fail">Fail</option>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] font-bold text-red-600 uppercase ml-1">Findings</Label>
                          <Input
                            name="findings"
                            value={formData.findings}
                            onChange={handleInputChange}
                            placeholder="Reasons..."
                            className="h-12 bg-white rounded-xl border-slate-200 shadow-sm"
                          />
                        </div>
                      </div>
                    ) : (
                  <div className="col-span-full space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                      <div className="flex-1 space-y-1 w-full sm:w-auto">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-widest ml-1">Analysis Name / Reference</Label>
                        <Input 
                          placeholder="e.g. Critical Process Trial 01" 
                          name="analysisName"
                          value={formData.analysisName} 
                          onChange={handleInputChange}
                          required
                          className="h-10 text-sm font-bold bg-slate-50/50"
                        />
                      </div>
                      <div className="flex gap-2 w-full sm:w-auto self-end">
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={async () => {
                            if (user && settings) {
                              const newSettings = { ...settings, lastCriticalProcesses: criticalProcesses };
                              await updateDoc(doc(db, 'userSettings', user.uid), { lastCriticalProcesses: criticalProcesses });
                              onSettingsUpdate(newSettings);
                              setSuccess('Processes saved as default!');
                              setTimeout(() => setSuccess(null), 3000);
                            }
                          }} 
                          className="gap-2 font-bold text-brand-600 border-brand-200 hover:bg-brand-50"
                        >
                          <Save className="h-4 w-4" /> Save as Default
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={addCriticalProcess} className="gap-2 font-bold">
                          <Plus className="h-4 w-4" /> Add Process
                        </Button>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      {criticalProcesses.map((p, i) => (
                        <div key={i} className="flex flex-col lg:flex-row gap-4 p-5 bg-white rounded-2xl border border-slate-200 shadow-sm relative group hover:border-brand-200 transition-colors">
                          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-slate-400 uppercase">Process Name</Label>
                              <div className="flex flex-col gap-1">
                                <Select 
                                  value={settings?.operations?.includes(p.name) ? p.name : ""} 
                                  onChange={(e) => updateCriticalProcess(i, 'name', e.target.value)}
                                  className="h-9 text-xs font-bold"
                                >
                                  <option value="">Select or Type Below</option>
                                  {settings?.operations?.map(op => <option key={op} value={op}>{op}</option>)}
                                </Select>
                                <Input 
                                  placeholder="Type manual process if not in list" 
                                  value={p.name} 
                                  onChange={(e) => updateCriticalProcess(i, 'name', e.target.value)}
                                  required
                                  className="h-9 text-xs"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-slate-400 uppercase">Operator Link</Label>
                              <Select 
                                value={p.operatorId} 
                                onChange={(e) => {
                                  const op = settings?.operators?.find(o => o.id === e.target.value);
                                  updateCriticalProcess(i, 'operatorId', e.target.value);
                                  updateCriticalProcess(i, 'operatorName', op?.name || '');
                                }}
                                className="h-9 text-xs font-bold"
                              >
                                <option value="">Select Operator</option>
                                {settings?.operators?.map(op => <option key={op.id} value={op.id}>{op.name} ({op.id})</option>)}
                              </Select>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-slate-400 uppercase">Name (Auto)</Label>
                                <Input disabled value={p.operatorName} className="h-9 text-xs bg-slate-50" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] font-black text-slate-400 uppercase">ID (Auto)</Label>
                                <Input disabled value={p.operatorId} className="h-9 text-xs bg-slate-50 data-value" />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] font-black text-slate-400 uppercase">Training Status</Label>
                              <Select
                                value={p.trainingStatus || ''}
                                onChange={(e) => updateCriticalProcess(i, 'trainingStatus', e.target.value)}
                                required
                                className="h-9 text-xs font-bold"
                              >
                                <option value="">Select</option>
                                <option value="Yes">Yes</option>
                                <option value="No">No</option>
                              </Select>
                            </div>
                          </div>
                          
                          <div className="w-full lg:w-48 flex gap-2">
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] font-black text-slate-400 uppercase">Check</Label>
                              <Input 
                                type="number" 
                                value={p.checkQty} 
                                onChange={(e) => updateCriticalProcess(i, 'checkQty', parseInt(e.target.value) || 0)}
                                required
                                className="data-value text-center h-[72px] lg:h-14 text-2xl lg:text-lg font-black"
                              />
                            </div>
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] font-black text-slate-400 uppercase">Defect</Label>
                              <Input 
                                type="number" 
                                value={p.defectQty} 
                                onChange={(e) => updateCriticalProcess(i, 'defectQty', parseInt(e.target.value) || 0)}
                                required
                                className="data-value text-center h-[72px] lg:h-14 text-2xl lg:text-lg font-black text-red-600"
                              />
                            </div>
                          </div>
                          {criticalProcesses.length > 1 && (
                            <button 
                              type="button"
                              onClick={() => removeCriticalProcess(i)}
                              className="absolute lg:-top-2 lg:-right-2 top-2 right-2 bg-white text-red-500 p-1 rounded-full border border-slate-200 shadow-sm opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity z-10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

        {/* Defect Entry System */}
            {(reportType === 'DHU' || activeSection === 'Cutting') && (
              <div className="space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      <div className="h-1 w-4 bg-red-500 rounded-full"></div> Defect Matrix
                    </h3>
                    {formData.operationName && (
                      <p className="text-[10px] font-black text-brand-600 uppercase tracking-widest mt-1 ml-6">
                        Table: {formData.operationName} Process Record
                      </p>
                    )}
                  </div>
                  <Badge variant="secondary" className="rounded-md px-3 font-black w-fit">
                    {`${defects.length} Active`}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2 p-4 sm:p-6 bg-slate-50 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto">
                  {(activeSection === 'Cutting' ? CUTTING_DEFECTS : SEWING_DEFECTS).map(d => {
                    const isActive = defects.some(df => df.name === d);
                    
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => addDefect(d)}
                        className={cn(
                          "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm",
                          isActive
                            ? "bg-slate-900 text-white border-slate-900 shadow-lg scale-[1.02]"
                            : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:text-slate-900"
                        )}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>

                {/* Selected Defects Table */}
                {defects.length > 0 && (
                  <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left min-w-[600px]">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-[10px] font-black tracking-widest">
                          <tr>
                            <th className="px-4 sm:px-6 py-4">Defect Classification</th>
                            <th className="px-4 sm:px-6 py-4 w-24 sm:w-32">Quantity</th>
                            {activeSection !== 'Cutting' && reportType !== 'RFT' && (
                              <>
                                <th className="px-4 sm:px-6 py-4">Operation</th>
                                <th className="px-4 sm:px-6 py-4">Operator Link</th>
                                <th className="px-4 sm:px-6 py-4">Table</th>
                              </>
                            )}
                            <th className="px-4 sm:px-6 py-4 w-12 sm:w-16"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                          {defects.map((d: any, i: number) => (
                            <tr key={`${d.name}-${i}`} className="group hover:bg-slate-50 transition-colors">
                              <td className="px-4 sm:px-6 py-4 font-black text-slate-900 uppercase text-[11px]">{d.name}</td>
                              <td className="px-4 sm:px-6 py-4">
                                <div className="flex items-center gap-2">
                                  <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-7 w-7 rounded-lg"
                                    onClick={() => removeDefect(d.name)}
                                  >
                                    <Minus className="h-3 w-3" />
                                  </Button>
                                  <span className="w-8 text-center font-black text-brand-600">{d.qty}</span>
                                  <Button 
                                    type="button" 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-7 w-7 rounded-lg"
                                    onClick={() => addDefect(d.name)}
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                              {activeSection !== 'Cutting' && reportType !== 'RFT' && (
                                <>
                                  <td className="px-4 sm:px-6 py-4">
                                    <Select
                                      value={d.operation}
                                      onChange={(e) => updateDefect(i, 'operation', e.target.value)}
                                      className="h-9 py-0 text-xs font-bold bg-slate-50 border-slate-200 min-w-[110px]"
                                    >
                                      <option value="">Select Op</option>
                                      {settings?.operations?.map(op => <option key={op} value={op}>{op}</option>)}
                                    </Select>
                                  </td>
                                  <td className="px-4 sm:px-6 py-4">
                                    <Select
                                      value={d.operatorId}
                                      onChange={(e) => {
                                        const op = settings?.operators?.find(o => o.id === e.target.value);
                                        updateDefect(i, 'operatorId', e.target.value);
                                        updateDefect(i, 'operatorName', op?.name || '');
                                      }}
                                      className="h-9 py-0 text-xs font-bold bg-slate-50 border-slate-200 min-w-[130px]"
                                    >
                                      <option value="">Select Operator</option>
                                      {settings?.operators?.map(op => <option key={op.id} value={op.id}>{op.name} ({op.id})</option>)}
                                    </Select>
                                  </td>
                                  <td className="px-4 sm:px-6 py-4">
                                    <Select
                                      value={d.tableType || ''}
                                      onChange={(e) => updateDefect(i, 'tableType', e.target.value)}
                                      className="h-9 py-0 text-xs font-bold bg-slate-50 border-slate-200 min-w-[120px]"
                                    >
                                      <option value="">Select Table</option>
                                      <option value="Shell table">Shell table</option>
                                      <option value="Inside table">Inside table</option>
                                      <option value="Output table">Output table</option>
                                    </Select>
                                  </td>
                                </>
                              )}
                              <td className="px-4 sm:px-6 py-4 text-right">
                                <Button variant="ghost" size="sm" onClick={() => {
                                  setDefects(defects.filter((_, idx) => idx !== i));
                                }} className="text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Smart Features: Unified Setup */}
            {activeSection !== 'Cutting' && (reportType === 'DHU' || reportType === 'Day Final Report') && (
              <div className="p-4 sm:p-8 bg-slate-50 rounded-3xl border border-slate-100">
                <div className="space-y-4">
                  <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                    <Plus className="h-3 w-3" /> {editingSetup ? 'Edit' : 'Register'} Full Config
                  </h5>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      placeholder="Operation Name"
                      value={setupForm.operationName}
                      onChange={(e) => setSetupForm({ ...setupForm, operationName: e.target.value })}
                      className="bg-white shadow-sm border-slate-200 w-full sm:w-auto flex-1"
                    />
                    <Input
                      placeholder="Operator Name"
                      value={setupForm.operatorName}
                      onChange={(e) => setSetupForm({ ...setupForm, operatorName: e.target.value })}
                      className="bg-white shadow-sm border-slate-200 w-full sm:w-auto flex-1"
                    />
                    <Input
                      placeholder="Operator ID"
                      value={setupForm.operatorId}
                      onChange={(e) => setSetupForm({ ...setupForm, operatorId: e.target.value })}
                      className="bg-white w-full sm:w-28 shrink-0 shadow-sm data-value border-slate-200"
                    />
                    <Select
                      value={setupForm.table}
                      onChange={(e) => setSetupForm({ ...setupForm, table: e.target.value })}
                      className="bg-white w-full sm:w-32 shrink-0 shadow-sm border-slate-200 text-xs"
                    >
                      <option value="">Table (Optional)</option>
                      <option value="Shell table">Shell table</option>
                      <option value="Inside table">Inside table</option>
                      <option value="Output table">Output table</option>
                    </Select>
                    <Button type="button" variant="primary" onClick={handleSetupSubmit} className="px-6 font-black uppercase tracking-widest shrink-0 w-full sm:w-auto">
                      {editingSetup ? 'Update' : 'Add'}
                    </Button>
                    {editingSetup && (
                      <Button type="button" variant="outline" onClick={() => { 
                        setEditingSetup(null); 
                        setSetupForm({ operationName: '', operatorName: '', operatorId: '', table: '' }); 
                      }} className="shrink-0 w-full sm:w-auto">Cancel</Button>
                    )}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 mt-4">
                    {settings?.operations?.map(op => {
                      const opId = settings?.operationOperatorMap?.[op];
                      const operator = settings?.operators?.find(o => o.id === opId);
                      return (
                        <Badge key={op} variant="secondary" className="pl-3 pr-1 py-1 gap-1 group font-bold">
                          <span className="flex flex-col gap-0.5 max-w-[200px]">
                            <span className="truncate">{op}</span>
                            {operator && (
                              <span className="text-[9px] text-slate-500 truncate mt-0.5">
                                {operator.name} ({operator.id})
                                {operator.table && <span> • {operator.table}</span>}
                              </span>
                            )}
                          </span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2 self-start mt-0.5">
                            <button type="button" onClick={() => { 
                              setEditingSetup(op); 
                              setSetupForm({
                                operationName: op,
                                operatorName: operator?.name || '',
                                operatorId: operator?.id || '',
                                table: operator?.table || ''
                              });
                            }} className="text-slate-400 hover:text-slate-900">
                              <Save className="h-3 w-3" />
                            </button>
                            <button type="button" onClick={() => deleteSetup(op)} className="text-slate-400 hover:text-red-500">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Live Stats Summary */}
            <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-6 sm:gap-8 p-6 sm:p-8 bg-slate-900 rounded-3xl text-white shadow-2xl">
              <div className="flex flex-wrap gap-6 sm:gap-12">
                <div>
                  <p className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] mb-1 sm:mb-2">Check Qty</p>
                  <p className="text-3xl sm:text-4xl font-black data-value">
                    {reportType === 'Needle Point Analysis' ? totalCriticalCheck : formData.totalCheckQty}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] mb-1 sm:mb-2">
                    {reportType === 'Needle Point Analysis' ? 'Pass Qty' : 'QC Pass'}
                  </p>
                  <p className="text-3xl sm:text-4xl font-black text-emerald-400 data-value">
                    {reportType === 'Needle Point Analysis' ? (totalCriticalCheck - totalCriticalDefects) : formData.qcPassQty}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase font-black text-slate-500 tracking-[0.2em] mb-1 sm:mb-2">Defects</p>
                  <p className="text-3xl sm:text-4xl font-black text-red-400 data-value">
                    {reportType === 'Needle Point Analysis' ? totalCriticalDefects : totalDefects}
                  </p>
                </div>
              </div>
              <div className="w-full sm:w-auto text-left sm:text-right bg-white/5 p-4 sm:p-6 rounded-2xl backdrop-blur-sm border border-white/10 mt-4 sm:mt-0">
                <p className="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] mb-1 sm:mb-2">
                  {reportType === 'RFT' || reportType === 'Needle Point Analysis' ? 'RFT Efficiency' : 'DHU Performance'}
                </p>
                <p className="text-4xl sm:text-6xl font-black data-value">
                  {(reportType === 'RFT' ? rftPercent : reportType === 'Needle Point Analysis' ? needleRftPercent : dhuPercent).toFixed(1)}<span className="text-xl sm:text-2xl text-slate-500 ml-1">%</span>
                </p>
              </div>
            </div>

            {/* Message Display */}
            {success && (
              <div className="flex items-center gap-2 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-200">
                <CheckCircle2 className="h-5 w-5" />
                <span className="text-sm font-medium">{success}</span>
              </div>
            )}
            {error && (
              <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-xl border border-red-200">
                <AlertCircle className="h-5 w-5" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <div className="fixed bottom-[80px] left-4 right-4 z-40 sm:static sm:z-auto bg-white/80 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none p-3 sm:p-0 rounded-2xl sm:rounded-none shadow-2xl sm:shadow-none border border-slate-200/50 sm:border-none">
              <Button type="submit" className="w-full h-14 text-lg font-bold gap-2 shadow-xl" disabled={loading}>
                {loading ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                ) : (
                  <Save className="h-5 w-5" />
                )}
                {loading ? 'Saving Report...' : 'Save Quality Report'}
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      </form>
    </CardContent>
  </Card>
  <div className="h-24 sm:hidden"></div>
</motion.div>
  );
}
