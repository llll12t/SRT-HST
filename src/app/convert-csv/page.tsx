'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, FolderOpen, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { deleteCsvTemplate, getCsvTemplates, saveCsvTemplate } from '@/lib/firestore';

type MappingKey = 'cat' | 'task' | 'qty' | 'unit' | 'cost' | 'resp' | 'start' | 'end' | 'progress' | 'status' | 'costCode';

interface Mappings {
  cat: string;
  task: string;
  qty: string;
  unit: string;
  cost: string;
  resp: string;
  start: string;
  end: string;
  progress: string;
  status: string;
  costCode: string;
}

interface AutoScheduleState {
  enabled: boolean;
  startDate: Date | null;
  daysPerSub: number;
  daysPerSub2: number;
}

interface ProcessedRow {
  Category: string;
  SubCategory: string;
  SubSubCategory: string;
  TaskName: string;
  Quantity: string;
  Cost: string;
  Responsible: string;
  PlanStart: string;
  PlanEnd: string;
  Duration: string | number;
  Progress: string;
  Status: string;
  CostCode: string;
  Type: 'task';
}

interface TemplateSnapshot {
  mappings: Mappings;
  startRow: number;
  autoSchedule: {
    enabled: boolean;
    startDate: string | null;
    daysPerSub: number;
    daysPerSub2: number;
  };
}

const DEFAULT_MAPPINGS: Mappings = {
  cat: 'A',
  task: 'B',
  qty: 'D',
  unit: 'C',
  cost: 'J',
  resp: 'None',
  start: 'None',
  end: 'None',
  progress: 'None',
  status: 'None',
  costCode: 'None'
};

const COLUMNS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const DEFAULT_TEMPLATE_NAME = 'Default';
const DEFAULT_TEMPLATE_SNAPSHOT: TemplateSnapshot = {
  mappings: { ...DEFAULT_MAPPINGS },
  startRow: 1,
  autoSchedule: { enabled: false, startDate: null, daysPerSub: 5, daysPerSub2: 3 }
};

function getColVal(row: unknown[], colChar: string) {
  if (!colChar || colChar === 'None') return '';
  const idx = colChar.charCodeAt(0) - 65;
  return String(row[idx] || '').trim();
}

function formatDate(dateObj: Date | null) {
  if (!dateObj || Number.isNaN(dateObj.getTime())) return '';
  const d = String(dateObj.getDate()).padStart(2, '0');
  const m = String(dateObj.getMonth() + 1).padStart(2, '0');
  const y = dateObj.getFullYear();
  return `${d}/${m}/${y}`;
}

function addDays(dateObj: Date, days: number) {
  const res = new Date(dateObj);
  res.setDate(res.getDate() + days);
  return res;
}

export default function ConvertCsvPage() {
  const { user, loading: authLoading } = useAuth();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileLabel, setFileLabel] = useState('No file selected');
  const [statusText, setStatusText] = useState('Ready');

  const [rawData, setRawData] = useState<unknown[][]>([]);
  const [mappings, setMappings] = useState<Mappings>(DEFAULT_MAPPINGS);
  const [startRow, setStartRow] = useState(1);
  const [autoSchedule, setAutoSchedule] = useState<AutoScheduleState>({
    enabled: false,
    startDate: null,
    daysPerSub: 5,
    daysPerSub2: 3
  });

  const [templates, setTemplates] = useState<Record<string, TemplateSnapshot>>({});
  const [selectedTemplate, setSelectedTemplate] = useState('Default');
  const [templateName, setTemplateName] = useState('Default');
  const [isDragOver, setIsDragOver] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  const resetToDefault = () => {
    restoreSnapshot(DEFAULT_TEMPLATE_SNAPSHOT);
    setSelectedTemplate(DEFAULT_TEMPLATE_NAME);
    setTemplateName(DEFAULT_TEMPLATE_NAME);
    setStatusText('Ready');
  };

  useEffect(() => {
    if (authLoading) return;

    const loadTemplates = async () => {
      if (!user?.id) {
        const fallback = { [DEFAULT_TEMPLATE_NAME]: DEFAULT_TEMPLATE_SNAPSHOT };
        setTemplates(fallback);
        setSelectedTemplate(DEFAULT_TEMPLATE_NAME);
        setTemplateName(DEFAULT_TEMPLATE_NAME);
        return;
      }
      try {
        setTemplatesLoading(true);
        const fromDb = await getCsvTemplates(user.id);
        const normalized: Record<string, TemplateSnapshot> = {};

        Object.entries(fromDb).forEach(([name, value]) => {
          normalized[name] = value as unknown as TemplateSnapshot;
        });

        // Always keep and use hard default as the initial state when opening this page.
        normalized[DEFAULT_TEMPLATE_NAME] = DEFAULT_TEMPLATE_SNAPSHOT;
        setTemplates(normalized);
        setSelectedTemplate(DEFAULT_TEMPLATE_NAME);
        setTemplateName(DEFAULT_TEMPLATE_NAME);
        restoreSnapshot(DEFAULT_TEMPLATE_SNAPSHOT);
      } catch (error) {
        console.error('Failed to load templates from Firestore:', error);
        const fallback = { [DEFAULT_TEMPLATE_NAME]: DEFAULT_TEMPLATE_SNAPSHOT };
        setTemplates(fallback);
        setSelectedTemplate(DEFAULT_TEMPLATE_NAME);
        setTemplateName(DEFAULT_TEMPLATE_NAME);
        restoreSnapshot(DEFAULT_TEMPLATE_SNAPSHOT);
      } finally {
        setTemplatesLoading(false);
      }
    };

    void loadTemplates();
  }, [user?.id, authLoading]);

  useEffect(() => {
    setTemplateName(selectedTemplate);
  }, [selectedTemplate]);

  const processData = useMemo<ProcessedRow[]>(() => {
    if (!rawData.length) return [];

    const { cat, task, qty, unit, cost, resp, start, end, progress, status, costCode } = mappings;
    const rows: ProcessedRow[] = [];
    let curCat = '';
    let curSub = '';
    let curSubSub = '';
    let schedDate = autoSchedule.startDate ? new Date(autoSchedule.startDate) : null;
    let lastSub: string | null = null;
    let lastSub2: string | null = null;
    const startIdx = Math.max(0, startRow - 1);

    for (let i = startIdx; i < rawData.length; i += 1) {
      const row = rawData[i];
      if (!row || row.length === 0) continue;

      const vCat = getColVal(row, cat);
      const vTask = getColVal(row, task);
      const vQty = getColVal(row, qty);
      const vUnit = getColVal(row, unit);
      const vCost = getColVal(row, cost);
      const vResp = getColVal(row, resp);
      const vCostCode = getColVal(row, costCode);
      const hasData = (vQty && vQty !== '0') || (vCost && vCost !== '0');

      if (vCat) {
        if (/^\d+$/.test(vCat) && !hasData) {
          if (curCat && !/^\d+$/.test(curCat)) {
            curSub = vTask;
            curSubSub = '';
          } else {
            curCat = vTask;
            curSub = '';
            curSubSub = '';
          }
          continue;
        }
        if (vCat.includes('.') && !hasData) {
          curSubSub = vTask;
          continue;
        }
        if (!hasData) {
          curCat = vTask;
          curSub = '';
          curSubSub = '';
          continue;
        }
      }

      if (!vTask) continue;

      let pStart = getColVal(row, start);
      let pEnd = getColVal(row, end);
      let duration: string | number = '';

      if (autoSchedule.enabled && schedDate) {
        const days1 = autoSchedule.daysPerSub;
        const days2 = autoSchedule.daysPerSub2;

        if (curSub !== lastSub) {
          if (lastSub !== null) schedDate = addDays(schedDate, days1);
          lastSub = curSub;
          lastSub2 = curSubSub;
        } else if (curSubSub && curSubSub !== lastSub2) {
          if (lastSub2 !== null) schedDate = addDays(schedDate, days2);
          lastSub2 = curSubSub;
        }

        const usedDuration = curSubSub ? days2 : days1;
        pStart = formatDate(schedDate);
        pEnd = formatDate(addDays(schedDate, usedDuration));
        duration = usedDuration;
      }

      rows.push({
        Category: curCat,
        SubCategory: curSub,
        SubSubCategory: curSubSub,
        TaskName: vTask,
        Quantity: vQty && vUnit ? `${vQty} ${vUnit}` : vQty,
        Cost: vCost.replace(/,/g, ''),
        Responsible: vResp,
        PlanStart: pStart,
        PlanEnd: pEnd,
        Duration: duration,
        Progress: getColVal(row, progress) || '0',
        Status: getColVal(row, status) || 'not-started',
        CostCode: vCostCode,
        Type: 'task'
      });
    }

    return rows;
  }, [rawData, mappings, startRow, autoSchedule]);

  const getSnapshot = (): TemplateSnapshot => ({
    mappings: { ...mappings },
    startRow,
    autoSchedule: {
      enabled: autoSchedule.enabled,
      startDate: autoSchedule.startDate ? autoSchedule.startDate.toISOString() : null,
      daysPerSub: autoSchedule.daysPerSub,
      daysPerSub2: autoSchedule.daysPerSub2
    }
  });

  const restoreSnapshot = (snap: TemplateSnapshot) => {
    setMappings({ ...DEFAULT_MAPPINGS, ...snap.mappings });
    setStartRow(snap.startRow || 1);
    setAutoSchedule({
      enabled: Boolean(snap.autoSchedule.enabled),
      startDate: snap.autoSchedule.startDate ? new Date(snap.autoSchedule.startDate) : null,
      daysPerSub: snap.autoSchedule.daysPerSub || 5,
      daysPerSub2: snap.autoSchedule.daysPerSub2 || 3
    });
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setFileLabel(file.name);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const { read, utils } = await import('xlsx');
      const workbook = read(new Uint8Array(arrayBuffer), { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy' }) as unknown[][];
      setRawData(rows);
      setStatusText('File Loaded');
    } catch (error) {
      console.error(error);
      setStatusText('Error reading file');
    }
  };

  const generateCSV = async () => {
    if (!processData.length) {
      alert('No data');
      return;
    }
    const header = ['Category', 'Subcategory', 'SubSubcategory', 'Type', 'Task Name', 'Plan Start', 'Plan End', 'Duration (Days)', 'Cost', 'Quantity', 'Responsible', 'Progress (%)', 'Status', 'Cost Code'];
    const wsData: Array<Array<string | number>> = [header];
    processData.forEach((r) => {
      wsData.push([r.Category, r.SubCategory, r.SubSubCategory, r.Type, r.TaskName, r.PlanStart, r.PlanEnd, r.Duration, r.Cost, r.Quantity, r.Responsible, r.Progress, r.Status, r.CostCode]);
    });
    const xlsx = await import('xlsx');
    const ws = xlsx.utils.aoa_to_sheet(wsData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Export');
    xlsx.writeFile(wb, 'converted_schedule.csv', { bookType: 'csv' });
  };

  const updateMapping = (key: MappingKey, value: string) => setMappings((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="bg-slate-50 text-slate-700 h-[calc(100vh-1rem)] flex flex-col text-sm overflow-hidden font-sans border border-slate-200 rounded-md">
      <nav className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between shadow-sm shrink-0 z-20">
        <div className="flex items-center gap-4">
          <h1 className="font-semibold text-slate-800 tracking-tight">CSV Tool</h1>
          <div className="h-4 w-px bg-slate-300 mx-2" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Template</span>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="Template name"
              className="bg-white border border-slate-300 text-xs rounded px-2 py-1 h-8 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none min-w-[140px]"
            />
            <select value={selectedTemplate} onChange={(e) => { setSelectedTemplate(e.target.value); if (templates[e.target.value]) restoreSnapshot(templates[e.target.value]); }} className="bg-slate-50 border border-slate-300 text-xs rounded px-2 py-1 h-8 focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none min-w-[120px]">
              {Object.keys(templates).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <div className="flex gap-1">
              <button
                onClick={resetToDefault}
                className="h-8 w-8 flex items-center justify-center rounded bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 transition shadow-sm"
                title="Reset to default"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button onClick={async () => {
                const name = templateName.trim();
                if (!name) {
                  alert('Please enter template name');
                  return;
                }
                if (!user?.id) {
                  alert('Please login first');
                  return;
                }
                try {
                  setTemplatesLoading(true);
                  const snapshot = getSnapshot();
                  await saveCsvTemplate(user.id, name, snapshot as unknown as Record<string, unknown>);
                  const next = { ...templates, [name]: snapshot };
                  setTemplates(next);
                  setSelectedTemplate(name);
                  setTemplateName(name);
                  alert(`Saved template: ${name}`);
                } catch (error) {
                  console.error('Failed to save template:', error);
                  alert('Failed to save template');
                } finally {
                  setTemplatesLoading(false);
                }
              }} className="h-8 w-8 flex items-center justify-center rounded bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 transition shadow-sm" title="Save">
                <Save className="w-4 h-4" />
              </button>
              <button onClick={async () => {
                if (selectedTemplate === DEFAULT_TEMPLATE_NAME) {
                  alert('Cannot delete Default');
                  return;
                }
                if (!confirm(`Delete template '${selectedTemplate}'?`)) return;
                if (!user?.id) {
                  alert('Please login first');
                  return;
                }
                try {
                  setTemplatesLoading(true);
                  await deleteCsvTemplate(user.id, selectedTemplate);
                  const next = { ...templates };
                  delete next[selectedTemplate];
                  if (!next[DEFAULT_TEMPLATE_NAME]) {
                    next[DEFAULT_TEMPLATE_NAME] = DEFAULT_TEMPLATE_SNAPSHOT;
                  }
                  const nextSelected = Object.keys(next)[0] || DEFAULT_TEMPLATE_NAME;
                  setTemplates(next);
                  setSelectedTemplate(nextSelected);
                  setTemplateName(nextSelected);
                  if (next[nextSelected]) restoreSnapshot(next[nextSelected]);
                } catch (error) {
                  console.error('Failed to delete template:', error);
                  alert('Failed to delete template');
                } finally {
                  setTemplatesLoading(false);
                }
              }} className="h-8 w-8 flex items-center justify-center rounded bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 transition shadow-sm" title="Delete">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="h-4 w-px bg-slate-300 mx-2" />
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
            onDrop={(e) => { e.preventDefault(); setIsDragOver(false); void handleFile(e.dataTransfer.files?.[0]); }}
            className={`group flex items-center gap-3 px-3 py-1 rounded border border-slate-300 border-dashed bg-slate-50 hover:bg-blue-50 hover:border-blue-400 transition cursor-pointer ${isDragOver ? 'border-blue-500 bg-blue-50' : ''}`}
            title="Click to upload"
          >
            <input ref={fileInputRef} type="file" accept=".xlsx, .xls, .csv" className="hidden" onChange={(e) => { void handleFile(e.target.files?.[0]); }} />
            <FolderOpen className="w-5 h-5 text-slate-500 group-hover:text-blue-600" />
            <div className="flex flex-col leading-none">
              <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{fileLabel}</span>
              <span className="text-[10px] text-slate-400 group-hover:text-blue-500">Click or Drag .xlsx</span>
            </div>
          </div>
        </div>
        <button onClick={() => void generateCSV()} disabled={!processData.length || templatesLoading} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded text-sm font-medium shadow-sm transition flex items-center gap-2">
          <Download className="w-4 h-4" />
          <span>Download CSV</span>
        </button>
      </nav>

      <section className="bg-slate-50 border-b border-slate-200 px-4 py-3 shrink-0 space-y-3">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-500 uppercase">Start Row</label>
            <input type="number" value={startRow} min={1} onChange={(e) => setStartRow(parseInt(e.target.value, 10) || 1)} className="w-16 h-7 text-sm border border-slate-300 rounded px-2 text-center focus:ring-1 focus:ring-blue-600 outline-none" />
          </div>
          <div className="h-4 w-px bg-slate-300" />
          <div className="flex items-center gap-3 bg-white px-3 py-1 rounded border border-slate-200 shadow-sm">
            <span className="text-xs font-semibold text-blue-600 uppercase tracking-widest">Auto Schedule</span>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Start Date</label>
              <input type="date" value={autoSchedule.startDate ? autoSchedule.startDate.toISOString().split('T')[0] : ''} onChange={(e) => setAutoSchedule((prev) => ({ ...prev, enabled: Boolean(e.target.value), startDate: e.target.value ? new Date(e.target.value) : null }))} className="h-7 text-xs border border-slate-300 rounded px-2 w-32 focus:ring-1 focus:ring-blue-600 outline-none" />
            </div>
            <div className="w-px h-3 bg-slate-200" />
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Days (Sub)</label>
              <input type="number" min={1} value={autoSchedule.daysPerSub} onChange={(e) => setAutoSchedule((prev) => ({ ...prev, daysPerSub: parseInt(e.target.value, 10) || 5 }))} className="h-7 w-12 text-xs border border-slate-300 rounded px-1 text-center bg-slate-50" />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-500">Days (Sub 2)</label>
              <input type="number" min={1} value={autoSchedule.daysPerSub2} onChange={(e) => setAutoSchedule((prev) => ({ ...prev, daysPerSub2: parseInt(e.target.value, 10) || 3 }))} className="h-7 w-12 text-xs border border-slate-300 rounded px-1 text-center bg-slate-50" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-10 gap-2 items-end">
          {(['cat', 'task', 'qty', 'unit', 'cost', 'resp', 'start', 'end', 'status', 'costCode'] as const).map((key) => (
            <div key={key} className={`flex flex-col gap-1 ${key === 'task' ? 'col-span-2' : ''}`}>
              <label className={`text-[10px] font-bold uppercase ${key === 'start' || key === 'end' || key === 'status' ? 'text-slate-400' : 'text-slate-500'}`}>
                {key === 'cat' ? 'Category' : key === 'task' ? 'Task Name' : key === 'qty' ? 'Qty' : key === 'unit' ? 'Unit' : key === 'cost' ? 'Cost' : key === 'resp' ? 'Responsible' : key === 'start' ? 'Start (Man)' : key === 'end' ? 'End (Man)' : key === 'status' ? 'Status' : 'Cost Code'}
              </label>
              <select value={mappings[key]} onChange={(e) => updateMapping(key, e.target.value)} className={`w-full text-xs border border-slate-300 rounded h-7 px-1 ${key === 'start' || key === 'end' || key === 'status' ? 'text-slate-500 bg-slate-50' : ''}`}>
                <option value="None">-- None --</option>
                {COLUMNS.map((c) => <option key={c} value={c}>Column {c}</option>)}
              </select>
            </div>
          ))}
        </div>
      </section>

      <main className="flex-1 bg-white overflow-hidden flex flex-col relative">
        <div className="px-4 py-2 border-b border-slate-200 bg-slate-50/50 flex justify-between items-center shrink-0">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-widest">Data Preview</h2>
          <div className="flex items-center gap-4 text-xs text-slate-500">
            <span>Records: {processData.length}</span>
            <div className="h-3 w-px bg-slate-300" />
            <span>{statusText}</span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 text-slate-500 text-xs font-semibold uppercase tracking-wider sticky top-0 shadow-sm ring-1 ring-slate-200/50 z-10">
              <tr>
                {['#', 'Category', 'Sub', 'Sub 2', 'Task Name', 'Qty', 'Cost', 'Resp.', 'Start', 'End', 'Dur.', 'Status', 'Cost Code'].map((h, idx) => (
                  <th key={h} className={`px-4 py-3 bg-slate-50 border-b border-slate-200 ${idx === 0 ? 'w-12 text-left' : idx === 4 ? 'w-64 text-left' : idx === 5 || idx === 6 ? 'text-right' : idx === 10 ? 'text-center' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-xs text-slate-700 divide-y divide-slate-100">
              {processData.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-6 py-12 text-center text-slate-400 bg-slate-50/30">
                    <div className="flex flex-col items-center gap-2">
                      <FileSpreadsheet className="w-8 h-8 opacity-50" />
                      <span>No Data Processed</span>
                    </div>
                  </td>
                </tr>
              ) : (
                processData.slice(0, 50).map((row, idx) => {
                  const statusClass = row.Status === 'completed' ? 'bg-green-100 text-green-700' : row.Status === 'in-progress' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500';
                  const hlClass = autoSchedule.enabled ? 'text-blue-600 font-medium' : '';
                  return (
                    <tr key={`${row.TaskName}-${idx}`} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-2 border-b border-slate-100 text-slate-400 font-mono text-[10px]">{idx + 1}</td>
                      <td className="px-4 py-2 border-b border-slate-100">{row.Category}</td>
                      <td className="px-4 py-2 border-b border-slate-100">{row.SubCategory}</td>
                      <td className="px-4 py-2 border-b border-slate-100">{row.SubSubCategory}</td>
                      <td className="px-4 py-2 border-b border-slate-100 font-medium text-slate-700">{row.TaskName}</td>
                      <td className="px-4 py-2 border-b border-slate-100 text-right font-mono">{row.Quantity}</td>
                      <td className="px-4 py-2 border-b border-slate-100 text-right font-mono">{row.Cost}</td>
                      <td className="px-4 py-2 border-b border-slate-100">{row.Responsible}</td>
                      <td className={`px-4 py-2 border-b border-slate-100 ${hlClass}`}>{row.PlanStart}</td>
                      <td className={`px-4 py-2 border-b border-slate-100 ${hlClass}`}>{row.PlanEnd}</td>
                      <td className={`px-4 py-2 border-b border-slate-100 text-center ${hlClass}`}>{row.Duration}</td>
                      <td className="px-4 py-2 border-b border-slate-100">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${statusClass}`}>{row.Status}</span>
                      </td>
                      <td className="px-4 py-2 border-b border-slate-100 text-slate-600 border-l border-slate-100">{row.CostCode}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
