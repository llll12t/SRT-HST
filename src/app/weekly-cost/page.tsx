'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, DollarSign, TrendingUp, AlertCircle, FileText, CheckCircle2, AlertTriangle, Plus, Trash2, Wallet } from 'lucide-react';
import { format, addWeeks, subWeeks, startOfWeek, endOfWeek, eachWeekOfInterval, isWithinInterval, parseISO, isValid, differenceInDays, addDays, getWeek, endOfDay } from 'date-fns';
import { getProjects, getAllTasks, getExpenses, createExpense, deleteExpense, updateProject } from '@/lib/firestore';
import { fetchGoogleSheetProjectActualExpensesByColumns, extractSheetId, extractSheetGid, CostCodeColumnMapping } from '@/lib/google-sheets';
import { Project, Task, Expense } from '@/types/construction';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

// Mock Expense Type (In real app, this would be in Firestore)
const GOOGLE_SHEET_TAB_NAME = '\u0E23\u0E27\u0E21\u0E41\u0E22\u0E01Project';
const IMPORT_DESCRIPTION_PREFIX = 'Actual Expenses';
const UNASSIGNED_COST_CODE = 'UNASSIGNED';
const LAST_IMPORT_URL_STORAGE_KEY = 'weekly-cost-last-import-url';
const COST_CODE_COLUMN_MAPPINGS: CostCodeColumnMapping[] = [
    { costCode: '1', costName: 'เหล็กเส้น', column: 'L' },
    { costCode: '2', costName: 'เหล็กรูปพรรณ', column: 'N' },
    { costCode: '3', costName: 'คอนกรีต', column: 'P' },
    { costCode: '4', costName: 'ไม้แบบ', column: 'R' },
    { costCode: '5', costName: 'วัสดุมุง', column: 'T' },
    { costCode: '6', costName: 'ฝ้าผนัง', column: 'V' },
    { costCode: '7', costName: 'ปูพื้น', column: 'X' },
    { costCode: '8', costName: 'กระจก', column: 'Z' },
    { costCode: '9', costName: 'ไฟฟ้า', column: 'AB' },
    { costCode: '10', costName: 'ประปา', column: 'AD' },
    { costCode: '11', costName: 'อื่นๆ(วัสดุ)', column: 'AF' },
    { costCode: '12', costName: 'สีเคมี', column: 'AH' },
    { costCode: '13', costName: 'สุขภัณฑ์', column: 'AJ' },
    { costCode: '14', costName: 'บิวอิน', column: 'AL' },
    { costCode: '15', costName: 'แอร์', column: 'AN' },
    { costCode: '16', costName: 'ดิน', column: 'AP' },
    { costCode: '17', costName: 'หินทราย', column: 'AR' },
    { costCode: '18', costName: 'เตรียมงาน', column: 'AT' }
];
const COST_CODE_NAME_MAP = COST_CODE_COLUMN_MAPPINGS.reduce<Record<string, string>>((acc, item) => {
    acc[item.costCode] = item.costName;
    return acc;
}, {});


export default function WeeklyCostPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [expenses, setExpenses] = useState<Expense[]>([]); // New state for Actual Costs
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'chart' | 'table' | 'expenses' | 'costcode'>('table');

    // New Expense Input State
    const [newExpenseAmount, setNewExpenseAmount] = useState('');
    const [newExpenseDesc, setNewExpenseDesc] = useState('');
    const [newExpenseCostCode, setNewExpenseCostCode] = useState('');
    const [newExpenseDate, setNewExpenseDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Google Sheet Import State
    const [importUrl, setImportUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [showImport, setShowImport] = useState(false);

    const persistLastImportUrl = (value: string) => {
        if (typeof window === 'undefined') return;
        const normalized = value.trim();
        if (normalized) {
            localStorage.setItem(LAST_IMPORT_URL_STORAGE_KEY, normalized);
            return;
        }
        localStorage.removeItem(LAST_IMPORT_URL_STORAGE_KEY);
    };

    const handleImportUrlChange = (value: string) => {
        setImportUrl(value);
        persistLastImportUrl(value);
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                const [projectsData, tasksData, expensesData] = await Promise.all([
                    getProjects(),
                    getAllTasks(),
                    getExpenses()
                ]);
                // Filter out completed and cancelled projects
                const activeProjects = projectsData.filter(p => p.status !== 'completed' && (p.status as string) !== 'cancelled');
                setProjects(activeProjects);
                setTasks(tasksData);
                setExpenses(expensesData);

            } catch (error) {
                console.error("Error fetching data", error);
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, []);

    // Auto-populate import URL if project has one
    useEffect(() => {
        const rememberedUrl =
            typeof window !== 'undefined'
                ? localStorage.getItem(LAST_IMPORT_URL_STORAGE_KEY) || ''
                : '';

        if (selectedProjectId && selectedProjectId !== 'all') {
            const project = projects.find(p => p.id === selectedProjectId);
            const projectSheetUrl = project?.googleSheetUrl?.trim() || '';
            if (projectSheetUrl) {
                setImportUrl(projectSheetUrl);
                persistLastImportUrl(projectSheetUrl);
                // Optional: You could auto-trigger import here if desired, 
                // but better to let user click "Sync" for safety.
            } else {
                setImportUrl(rememberedUrl);
            }
        } else {
            setImportUrl(rememberedUrl);
        }
    }, [selectedProjectId, projects]);

    // 1. Filter Tasks & Expenses
    const filteredTasks = useMemo(() => {
        if (selectedProjectId === 'all') {
            // Only include tasks from active projects
            const activeProjectIds = new Set(projects.map(p => p.id));
            return tasks.filter(t => activeProjectIds.has(t.projectId));
        }
        return tasks.filter(t => t.projectId === selectedProjectId);
    }, [selectedProjectId, tasks, projects]);

    const filteredExpenses = useMemo(() => {
        if (selectedProjectId === 'all') {
            // Only include expenses from active projects
            const activeProjectIds = new Set(projects.map(p => p.id));
            return expenses.filter(e => activeProjectIds.has(e.projectId));
        }
        return expenses.filter(e => e.projectId === selectedProjectId);
    }, [selectedProjectId, expenses, projects]);

    const handleAddExpense = async () => {
        if (!newExpenseAmount || !selectedProjectId || selectedProjectId === 'all') return;

        try {
            const amount = parseFloat(newExpenseAmount);
            if (isNaN(amount) || amount <= 0) return;

            const newId = await createExpense({
                projectId: selectedProjectId,
                date: newExpenseDate,
                amount: amount,
                description: newExpenseDesc || 'General Expense',
                costCode: newExpenseCostCode.trim() || undefined
            });

            // Optimistic update
            const newExpense: Expense = {
                id: newId,
                projectId: selectedProjectId,
                date: newExpenseDate,
                amount: amount,
                description: newExpenseDesc || 'General Expense',
                costCode: newExpenseCostCode.trim() || undefined,
                createdAt: new Date().toISOString()
            };

            setExpenses(prev => [...prev, newExpense]);
            setNewExpenseAmount('');
            setNewExpenseDesc('');
            setNewExpenseCostCode('');
        } catch (error) {
            console.error("Error adding expense", error);
            alert("Failed to add expense");
        }
    };

    const handleGoogleImport = async () => {
        const normalizedImportUrl = importUrl.trim();
        const sheetId = extractSheetId(normalizedImportUrl);
        if (!sheetId) {
            alert('Invalid Google Sheet URL. Please ensure it is a valid Google Sheet link.');
            return;
        }
        const sheetGid = extractSheetGid(normalizedImportUrl) || undefined;
        persistLastImportUrl(normalizedImportUrl);

        setImporting(true);
        try {
            const importedExpenses = await fetchGoogleSheetProjectActualExpensesByColumns(
                sheetId,
                COST_CODE_COLUMN_MAPPINGS,
                GOOGLE_SHEET_TAB_NAME,
                sheetGid
            );

            if (importedExpenses.length === 0) {
                alert('No valid rows found. Ensure A=Project Code, B=Project Name, and amounts exist in mapped columns L..AT.');
                setImporting(false);
                return;
            }

            if (!confirm(`Found ${importedExpenses.length} rows. Import Actual Expenses by Project Code?`)) {
                setImporting(false);
                return;
            }

            const normalizeCode = (value: string) => value.trim().toLowerCase();
            const projectByCode = new Map<string, Project>(
                projects
                    .filter(p => !!p.code && p.code.trim().length > 0)
                    .map(p => [normalizeCode(p.code as string), p])
            );

            let targetProjectId: string | null = null;
            let targetProjectCode: string | null = null;

            if (selectedProjectId !== 'all') {
                const selectedProject = projects.find(p => p.id === selectedProjectId);
                if (!selectedProject) {
                    alert('Selected project was not found.');
                    setImporting(false);
                    return;
                }
                if (!selectedProject.code || !selectedProject.code.trim()) {
                    alert('Selected project has no Project Code. Please set "เลขที่โครงการ" first.');
                    setImporting(false);
                    return;
                }
                targetProjectId = selectedProject.id;
                targetProjectCode = normalizeCode(selectedProject.code);
            }

            // Save sheet URL to project if it's new
            const currentProject = projects.find(p => p.id === selectedProjectId);
            if (selectedProjectId !== 'all' && currentProject && currentProject.googleSheetUrl !== normalizedImportUrl) {
                await updateProject(selectedProjectId, { googleSheetUrl: normalizedImportUrl });
                // Update local state
                setProjects(prev => prev.map(p => p.id === selectedProjectId ? { ...p, googleSheetUrl: normalizedImportUrl } : p));
            }

            let count = 0;
            let skipped = 0;
            let unmatched = 0;

            const importDate = format(new Date(), 'yyyy-MM-dd');

            // Check for duplicates before adding
            const existingKeys = new Set(expenses
                .map(e => `${e.projectId}-${e.date}-${e.amount}-${(e.costCode || UNASSIGNED_COST_CODE)}-${e.description.substring(0, 20)}`)
            );

            const createdExpenses: Expense[] = [];

            for (const exp of importedExpenses) {
                if (isNaN(exp.actualExpense) || exp.actualExpense <= 0) continue;

                const rowCode = normalizeCode(exp.projectCode);
                if (!rowCode) {
                    unmatched++;
                    continue;
                }

                if (targetProjectCode && rowCode !== targetProjectCode) {
                    unmatched++;
                    continue;
                }

                const matchedProject = targetProjectId
                    ? projects.find(p => p.id === targetProjectId)
                    : projectByCode.get(rowCode);

                if (!matchedProject) {
                    unmatched++;
                    continue;
                }

                const costName = exp.costName || COST_CODE_NAME_MAP[exp.costCode || ''] || '';
                const description = `${IMPORT_DESCRIPTION_PREFIX} - ${(exp.projectName || exp.projectCode).substring(0, 60)}${costName ? ` (${costName})` : ''}`;
                const importCostCode = exp.costCode?.trim() || UNASSIGNED_COST_CODE;

                const key = `${matchedProject.id}-${importDate}-${exp.actualExpense}-${importCostCode}-${description.substring(0, 20)}`;

                if (existingKeys.has(key)) {
                    skipped++;
                    continue;
                }

                const newId = await createExpense({
                    projectId: matchedProject.id,
                    date: importDate,
                    amount: exp.actualExpense,
                    description,
                    costCode: importCostCode
                });

                const newExpense: Expense = {
                    id: newId,
                    projectId: matchedProject.id,
                    date: importDate,
                    amount: exp.actualExpense,
                    description,
                    costCode: importCostCode,
                    createdAt: new Date().toISOString()
                };
                createdExpenses.push(newExpense);
                existingKeys.add(key);
                count++;
            }

            if (createdExpenses.length > 0) {
                setExpenses(prev => [...prev, ...createdExpenses]);
            }

            alert(
                `Import Results:\n- Added: ${count} items\n- Skipped (Duplicates): ${skipped} items\n- Not Matched by Project Code: ${unmatched} items`
            );
            setImportUrl(normalizedImportUrl);
            setShowImport(false);
        } catch (error) {
            console.error('Import failed', error);
            alert('Failed to import. Ensure the sheet is Public and mapped columns are available (A,B,L..AT).');
        } finally {
            setImporting(false);
        }
    };

    const handleDeleteExpense = async (id: string) => {
        if (!confirm('Are you sure you want to delete this expense?')) return;

        try {
            await deleteExpense(id);
            setExpenses(prev => prev.filter(e => e.id !== id));
        } catch (error) {
            console.error("Error deleting expense", error);
            alert("Failed to delete expense");
        }
    };

    // 2. Analyze Data Health
    const dataHealth = useMemo(() => {
        let missingCost = 0;
        let missingDates = 0;
        let total = filteredTasks.length;
        let itemsWithCost = 0;

        filteredTasks.forEach(t => {
            if (t.type === 'group') return;

            // User requested to ignore missing cost notification
            // if (!t.cost || t.cost === 0) missingCost++;
            if (t.cost && t.cost > 0) itemsWithCost++;

            if (!t.planStartDate || !t.planEndDate) missingDates++;
        });

        return { total, missingCost, missingDates, itemsWithCost };
    }, [filteredTasks]);

    // 3. Calculate Stats & Weekly Data
    const stats = useMemo(() => {
        let totalBudget = 0;
        let plannedToDate = 0;
        let earnedToDate = 0;
        let actualCostToDate = 0; // Sum of expenses

        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
        let weeklyPlan = 0;

        // Calculate EV & PV from Tasks
        filteredTasks.forEach(task => {
            if (task.type === 'group') return;

            const cost = task.cost || 0;
            totalBudget += cost;

            // Earned Value (Ev)
            const progress = task.progress || 0;
            earnedToDate += (cost * progress) / 100;

            // Planned Value (PV)
            if (task.planStartDate && task.planEndDate) {
                const start = parseISO(task.planStartDate);
                const end = parseISO(task.planEndDate);

                if (isValid(start) && isValid(end) && end.getTime() >= start.getTime()) {
                    const now = new Date();

                    const totalDuration = end.getTime() - start.getTime();
                    const passedDuration = Math.min(Math.max(0, now.getTime() - start.getTime()), totalDuration);

                    const percentPlanned = totalDuration === 0 ? (now >= start ? 1 : 0) : (passedDuration / totalDuration);
                    plannedToDate += cost * percentPlanned;

                    // Weekly Plan calculation
                    const overlapStart = Math.max(start.getTime(), weekStart.getTime());
                    const overlapEnd = Math.min(end.getTime(), weekEnd.getTime());
                    const overlapDuration = Math.max(0, overlapEnd - overlapStart);

                    if (totalDuration > 0) {
                        weeklyPlan += cost * (overlapDuration / totalDuration);
                    }
                }
            }
        });

        // Calculate AC from Expenses
        filteredExpenses.forEach(exp => {
            actualCostToDate += exp.amount;
        });

        // CPI (Cost Performance Index) = EV / AC ( > 1 is good)
        // CV (Cost Variance) = EV - AC ( > 0 is good)
        // SPI (Schedule Performance Index) = EV / PV ( > 1 is good)

        const cpi = actualCostToDate > 0 ? earnedToDate / actualCostToDate : 0;
        const spi = plannedToDate > 0 ? earnedToDate / plannedToDate : 0;

        // Estimate at Completion (EAC) = Total Budget / CPI
        const eac = cpi > 0 ? totalBudget / cpi : totalBudget;

        return {
            totalBudget,
            plannedToDate,
            earnedToDate,
            actualCostToDate,
            costVariance: earnedToDate - actualCostToDate,
            scheduleVariance: earnedToDate - plannedToDate,
            weeklyPlan,
            cpi,
            spi,
            eac
        };
    }, [filteredTasks, filteredExpenses, currentDate]);

    const costCodeReport = useMemo(() => {
        type CostCodeRow = {
            costCode: string;
            planned: number;
            earned: number;
            actual: number;
            taskCount: number;
            expenseCount: number;
        };

        const rows = new Map<string, CostCodeRow>();
        const normalizeCostCode = (value?: string) => (value && value.trim() ? value.trim().toUpperCase() : UNASSIGNED_COST_CODE);
        const ensureRow = (costCode: string): CostCodeRow => {
            const existing = rows.get(costCode);
            if (existing) return existing;
            const created: CostCodeRow = {
                costCode,
                planned: 0,
                earned: 0,
                actual: 0,
                taskCount: 0,
                expenseCount: 0
            };
            rows.set(costCode, created);
            return created;
        };

        filteredTasks.forEach(task => {
            if (task.type === 'group') return;

            const row = ensureRow(normalizeCostCode(task.costCode));
            row.taskCount += 1;

            const cost = task.cost || 0;
            const progress = task.progress || 0;
            row.earned += (cost * progress) / 100;

            if (task.planStartDate && task.planEndDate) {
                const start = parseISO(task.planStartDate);
                const end = parseISO(task.planEndDate);
                if (isValid(start) && isValid(end) && end.getTime() >= start.getTime()) {
                    const now = new Date();
                    const totalDuration = end.getTime() - start.getTime();
                    const passedDuration = Math.min(Math.max(0, now.getTime() - start.getTime()), totalDuration);
                    const percentPlanned = totalDuration === 0 ? (now >= start ? 1 : 0) : (passedDuration / totalDuration);
                    row.planned += cost * percentPlanned;
                }
            }
        });

        filteredExpenses.forEach(exp => {
            const row = ensureRow(normalizeCostCode(exp.costCode));
            row.expenseCount += 1;
            row.actual += exp.amount;
        });

        const breakdown = Array.from(rows.values())
            .map(row => {
                const variance = row.earned - row.actual;
                const cpi = row.actual > 0 ? row.earned / row.actual : 0;
                return { ...row, variance, cpi };
            })
            .sort((a, b) => {
                if (a.costCode === UNASSIGNED_COST_CODE) return 1;
                if (b.costCode === UNASSIGNED_COST_CODE) return -1;
                return a.costCode.localeCompare(b.costCode);
            });

        const totals = breakdown.reduce(
            (acc, row) => {
                acc.planned += row.planned;
                acc.earned += row.earned;
                acc.actual += row.actual;
                acc.taskCount += row.taskCount;
                acc.expenseCount += row.expenseCount;
                return acc;
            },
            { planned: 0, earned: 0, actual: 0, taskCount: 0, expenseCount: 0 }
        );

        return { breakdown, totals };
    }, [filteredTasks, filteredExpenses]);

    // 4. Generate S-Curve Chart Data
    const sCurveChartData = useMemo(() => {
        if (filteredTasks.length === 0) return [];

        let minDate: Date | null = null;
        let maxDate: Date | null = null;

        // Find range
        filteredTasks.forEach(t => {
            if (t.type === 'group') return;
            if (t.planStartDate) {
                const d = parseISO(t.planStartDate);
                if (isValid(d) && (!minDate || d < minDate)) minDate = d;
            }
            if (t.planEndDate) {
                const d = parseISO(t.planEndDate);
                if (isValid(d) && (!maxDate || d > maxDate)) maxDate = d;
            }
            if (t.actualStartDate) {
                const d = parseISO(t.actualStartDate);
                if (isValid(d) && (!minDate || d < minDate)) minDate = d;
            }
        });

        // Include expense dates in range
        filteredExpenses.forEach(e => {
            const d = parseISO(e.date);
            if (isValid(d)) {
                if (!minDate || d < minDate) minDate = d;
                if (!maxDate || d > maxDate) maxDate = d;
            }
        });

        if (!minDate || !maxDate) {
            minDate = subWeeks(new Date(), 4);
            maxDate = addWeeks(new Date(), 4);
        }

        // Buffer
        minDate = subWeeks(minDate, 1);
        maxDate = addWeeks(maxDate, 2);

        const weeks = eachWeekOfInterval({
            start: minDate,
            end: maxDate
        }, { weekStartsOn: 1 });

        let runningAC = 0;

        return weeks.map(weekStart => {
            const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
            const weekLabel = format(weekEnd, 'd MMM');

            let pv = 0;
            let ev = 0;
            // ac is accumulated externally

            // Filter expenses up to this week
            // Efficient way: loop all expenses every time? OR sort expenses first? 
            // Dataset is small, loop all is fine.
            let acForThisPoint = 0;
            filteredExpenses.forEach(e => {
                const d = parseISO(e.date);
                if (isValid(d) && d <= weekEnd) {
                    acForThisPoint += e.amount;
                }
            });

            filteredTasks.forEach(task => {
                if (task.type === 'group') return;
                const cost = task.cost || 0;

                // PV Calculation
                if (task.planStartDate && task.planEndDate) {
                    const start = parseISO(task.planStartDate);
                    const end = parseISO(task.planEndDate);
                    if (isValid(start) && isValid(end) && end >= start) {
                        const totalDur = end.getTime() - start.getTime();
                        let passed = 0;
                        if (weekEnd >= end) passed = totalDur;
                        else if (weekEnd > start) passed = weekEnd.getTime() - start.getTime();

                        const ratio = totalDur === 0 ? (weekEnd >= start ? 1 : 0) : (passed / totalDur);
                        pv += cost * ratio;
                    }
                }

                // EV Calculation (Simplified using Actual Start + Progress)
                // If task started, we assume linear progress from actual start to NOW (if ongoing) or actual End (if done)
                // BUT we don't know "Now" in the past context easily without logs.
                // Approximating:
                // Rule: If weekEnd < actualStartDate -> EV = 0
                // Rule: If weekEnd >= actualEndDate (if set) -> EV = Final Cost * Progress%
                // Rule: In between -> Linear interpolation

                if (task.actualStartDate && (task.progress || 0) > 0) {
                    const start = parseISO(task.actualStartDate);
                    const progressVal = (cost * (task.progress || 0)) / 100;

                    // Determine "End of Progress" date.
                    // If completed, use actualEndDate or Today. 
                    // If in progress, assume Today is the latest data point.
                    const effectiveEnd = task.actualEndDate ? parseISO(task.actualEndDate) : new Date(); // Use real Today/Now

                    if (isValid(start) && isValid(effectiveEnd)) {
                        if (weekEnd < start) {
                            ev += 0;
                        } else if (weekEnd >= effectiveEnd) {
                            ev += progressVal;
                        } else {
                            // Linear between start and effectiveEnd
                            const totalDur = effectiveEnd.getTime() - start.getTime();
                            const passed = weekEnd.getTime() - start.getTime();
                            const ratio = totalDur <= 0 ? 1 : (passed / totalDur);
                            ev += progressVal * ratio;
                        }
                    }
                }
            });

            return {
                name: weekLabel,
                date: weekEnd,
                pv: Math.round(pv),
                ev: Math.round(ev),
                ac: Math.round(acForThisPoint)
            };
        });

    }, [filteredTasks, filteredExpenses]);

    const formatMoney = (amount: number) => `\u0E3F${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
    const formatExpenseDate = (dateText: string) => {
        const parsed = parseISO(dateText);
        return isValid(parsed) ? format(parsed, 'dd MMM yy') : (dateText || '-');
    };

    return (
        <div className="container mx-auto p-4 space-y-4 bg-white min-h-screen text-slate-800">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-gray-700" />
                        Weekly Cost Report
                    </h1>
                    <p className="text-[13px] text-gray-500 mt-1">Financial monitoring & performance tracking</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="bg-white border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none min-w-[180px]"
                    >
                        <option value="all">All Projects</option>
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    <div className="flex items-center bg-white rounded border border-gray-300 px-1 py-0.5 shadow-none">
                        <button className="p-1 hover:bg-gray-50 rounded text-gray-600" onClick={() => setCurrentDate(subWeeks(currentDate, 1))}>
                            <span className="sr-only">Previous</span>
                            &lt;
                        </button>
                        <span className="text-[13px] font-medium px-2 flex items-center gap-1 min-w-[120px] justify-center text-gray-700">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            W{format(currentDate, 'w')} {format(currentDate, 'MMM yy')}
                        </span>
                        <button className="p-1 hover:bg-gray-50 rounded text-gray-600" onClick={() => setCurrentDate(addWeeks(currentDate, 1))}>
                            <span className="sr-only">Next</span>
                            &gt;
                        </button>
                    </div>
                </div>
            </div>

            {/* Project Status Alerts */}
            <div className="space-y-2">
                {/* Data Warning - Schedule Only */}
                {dataHealth.missingDates > 0 && (
                    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 rounded-r flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[13px] font-bold text-amber-800 uppercase tracking-wide">Incomplete Schedule Data</p>
                            <p className="text-[13px] text-amber-700 mt-0.5">
                                Found {dataHealth.missingDates} tasks with missing start/end dates.
                                <span className="underline ml-1 cursor-pointer">Review plan.</span>
                            </p>
                        </div>
                    </div>
                )}

                {/* Cost Overrun Warning (CPI < 1) */}
                {stats.cpi < 1 && stats.actualCostToDate > 0 && (
                    <div className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r flex items-start gap-3">
                        <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[13px] font-bold text-rose-800 uppercase tracking-wide">Budget Overrun Alert</p>
                            <p className="text-[13px] text-rose-700 mt-0.5">
                                Current Spending Efficiency (CPI) is <strong>{stats.cpi.toFixed(2)}</strong>.
                                You are overspending by {formatMoney(Math.abs(stats.costVariance))}.
                            </p>
                        </div>
                    </div>
                )}

                {/* Schedule Delay Warning (SPI < 1) */}
                {stats.spi < 1 && stats.plannedToDate > 0 && (
                    <div className="bg-orange-50 border-l-4 border-orange-400 p-3 rounded-r flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                        <div>
                            <p className="text-[13px] font-bold text-orange-800 uppercase tracking-wide">Schedule Delay Alert</p>
                            <p className="text-[13px] text-orange-700 mt-0.5">
                                Schedule Performance (SPI) is <strong>{stats.spi.toFixed(2)}</strong>.
                                Project is lagging behind the baseline plan.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* KPI Cards - Compact with Borders only */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="bg-white rounded border border-gray-200 p-3">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Planned Value</p>
                        <FileText className="h-3.5 w-3.5 text-blue-500 opacity-70" />
                    </div>
                    <div className="text-lg font-bold text-gray-900">{formatMoney(stats.plannedToDate)}</div>
                    <div className="text-[13px] text-gray-400">Baseline Budget</div>
                </div>
                <div className="bg-white rounded border border-gray-200 p-3">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Earned Value</p>
                        <TrendingUp className="h-3.5 w-3.5 text-emerald-500 opacity-70" />
                    </div>
                    <div className="text-lg font-bold text-emerald-700">{formatMoney(stats.earnedToDate)}</div>
                    <div className="text-[13px] text-emerald-600/70">Work Performed</div>
                </div>
                <div className="bg-white rounded border border-gray-200 p-3">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Actual Cost</p>
                        <Wallet className="h-3.5 w-3.5 text-rose-500 opacity-70" />
                    </div>
                    <div className="text-lg font-bold text-rose-700">{formatMoney(stats.actualCostToDate)}</div>
                    <div className="text-[13px] text-rose-600/70">Total Paid</div>
                </div>
                <div className="bg-white rounded border border-gray-200 p-3">
                    <div className="flex justify-between items-start mb-1">
                        <p className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Cost Variance</p>
                        <AlertCircle className="h-3.5 w-3.5 text-gray-400 opacity-70" />
                    </div>
                    <div className={`text-lg font-bold ${stats.costVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stats.costVariance >= 0 ? '+' : ''}{formatMoney(stats.costVariance)}
                    </div>
                    <div className={`text-[13px] font-medium ${stats.costVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {stats.costVariance >= 0 ? 'Under Budget' : 'Over Budget'}
                    </div>
                </div>
            </div>

            {/* Content Tabs */}
            <div className="w-full">
                {/* Clean Tab Navigation */}
                <div className="flex items-center gap-1 border-b border-gray-200 mb-4">
                    <button
                        onClick={() => setActiveTab('table')}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'table' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Breakdown Monitor
                    </button>
                    <button
                        onClick={() => setActiveTab('expenses')}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'expenses' ? 'border-rose-600 text-rose-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Actual Expenses
                    </button>
                    <button
                        onClick={() => setActiveTab('costcode')}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'costcode' ? 'border-emerald-600 text-emerald-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        Cost Code Report
                    </button>
                    <button
                        onClick={() => setActiveTab('chart')}
                        className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors ${activeTab === 'chart' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                    >
                        S-Curve Analysis
                    </button>
                </div>

                {activeTab === 'chart' && (
                    <div className="space-y-4">
                        <div className="bg-white rounded border border-gray-200 p-4 h-[450px]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-gray-500" />
                                    Financial S-Curve
                                </h3>
                                {/* Legend - Compact */}
                                <div className="flex items-center gap-4 text-[13px] text-gray-600">
                                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-blue-600"></div>PV (Plan)</div>
                                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-emerald-500"></div>EV (Work)</div>
                                    <div className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-rose-500"></div>AC (Paid)</div>
                                </div>
                            </div>

                            <ResponsiveContainer width="100%" height="90%">
                                <LineChart
                                    data={sCurveChartData}
                                    margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                                    <XAxis
                                        dataKey="name"
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        interval="preserveStartEnd"
                                        minTickGap={30}
                                        tickLine={false}
                                        axisLine={{ stroke: '#e5e7eb' }}
                                    />
                                    <YAxis
                                        tickFormatter={(value) => `${(value / 1000000).toFixed(1)}M`}
                                        tick={{ fontSize: 10, fill: '#6b7280' }}
                                        width={40}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <Tooltip
                                        formatter={(value: any) => formatMoney(value)}
                                        labelStyle={{ color: '#111', fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}
                                        contentStyle={{ borderRadius: '4px', border: '1px solid #e5e7eb', boxShadow: 'none', padding: '8px 12px', fontSize: '12px' }}
                                        itemStyle={{ padding: 0 }}
                                    />
                                    <ReferenceLine x={format(endOfWeek(currentDate, { weekStartsOn: 1 }), 'd MMM')} stroke="#ef4444" strokeDasharray="3 3" />
                                    <Line type="monotone" dataKey="pv" stroke="#2563eb" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="ev" stroke="#10b981" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                                    <Line type="monotone" dataKey="ac" stroke="#f43f5e" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>

                        {/* EVM Metrics - Compact Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-white p-3 rounded border border-gray-200">
                                <div className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider">CPI (Cost Efficiency)</div>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className={`text-lg font-bold ${stats.cpi >= 1 ? 'text-emerald-700' : 'text-rose-700'}`}>{stats.cpi.toFixed(2)}</span>
                                    <span className="text-[13px] text-gray-400">{stats.cpi >= 1 ? 'Efficient' : 'Inefficient'}</span>
                                </div>
                            </div>
                            <div className="bg-white p-3 rounded border border-gray-200">
                                <div className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider">SPI (Schedule Efficiency)</div>
                                <div className="flex items-baseline gap-2 mt-1">
                                    <span className={`text-lg font-bold ${stats.spi >= 1 ? 'text-emerald-700' : 'text-rose-700'}`}>{stats.spi.toFixed(2)}</span>
                                    <span className="text-[13px] text-gray-400">{stats.spi >= 1 ? 'On Time' : 'Delayed'}</span>
                                </div>
                            </div>
                            <div className="bg-white p-3 rounded border border-gray-200">
                                <div className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider">EAC (Forecast At Completion)</div>
                                <div className="mt-1 text-lg font-bold text-gray-800">{formatMoney(stats.eac)}</div>
                            </div>
                            <div className="bg-white p-3 rounded border border-gray-200">
                                <div className="text-[13px] font-semibold text-gray-500 uppercase tracking-wider">ETC (To Complete)</div>
                                <div className="mt-1 text-lg font-bold text-gray-800">{formatMoney(Math.max(0, stats.eac - stats.actualCostToDate))}</div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Expenses Tab */}
                {activeTab === 'expenses' && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                        {/* Input & Import */}
                        <div className="md:col-span-1 space-y-4">
                            {/* Google Sheets Import Card */}
                            <div className="bg-white rounded border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <FileText className="w-3.5 h-3.5 text-green-600" /> Import from Sheets
                                </h3>
                                {!showImport ? (
                                    <button
                                        onClick={() => setShowImport(true)}
                                        className="w-full text-[13px] text-blue-600 hover:bg-blue-50 border border-blue-200 rounded py-2 flex items-center justify-center gap-2 transition-colors"
                                    >
                                        Import via Link
                                    </button>
                                ) : (
                                    <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                                        <div>
                                            <label className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Google Sheet Link</label>
                                            <input
                                                type="text"
                                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                                                placeholder="https://docs.google.com/spreadsheets/d/..."
                                                value={importUrl}
                                                onChange={e => handleImportUrlChange(e.target.value)}
                                            />
                                            <p className="text-[13px] text-gray-400 mt-1">Mapped columns: A=Project Code, B=Name, 1(L), 2(N), 3(P), 4(R), 5(T), 6(V), 7(X), 8(Z), 9(AB), 10(AD), 11(AF), 12(AH), 13(AJ), 14(AL), 15(AN), 16(AP), 17(AR), 18(AT).</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleGoogleImport}
                                                disabled={importing || !importUrl.trim()}
                                                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-[13px] font-medium transition-colors disabled:opacity-50"
                                            >
                                                {importing ? 'Syncing...' : 'Check for New Expenses'}
                                            </button>
                                            <button
                                                onClick={() => setShowImport(false)}
                                                className="px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 py-1.5 rounded text-[13px] font-medium transition-colors"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Manual Entry Form */}
                            <div className="bg-white rounded border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2 border-b border-gray-100 pb-2">
                                    <Plus className="w-3.5 h-3.5" /> Record Expense
                                </h3>
                                {selectedProjectId === 'all' ? (
                                    <div className="text-[13px] text-amber-600 bg-amber-50 p-2 rounded border border-amber-100">
                                        Select a project to add expenses.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Date</label>
                                            <input
                                                type="date"
                                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                                value={newExpenseDate}
                                                onChange={e => setNewExpenseDate(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Amount (THB)</label>
                                            <input
                                                type="number"
                                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                                placeholder="0.00"
                                                value={newExpenseAmount}
                                                onChange={e => setNewExpenseAmount(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Description</label>
                                            <input
                                                type="text"
                                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                                placeholder="Expense details..."
                                                value={newExpenseDesc}
                                                onChange={e => setNewExpenseDesc(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[13px] font-semibold text-gray-500 uppercase tracking-wide">Cost Code</label>
                                            <input
                                                type="text"
                                                className="w-full mt-1 border border-gray-300 rounded px-2 py-1.5 text-[13px] focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                                placeholder="e.g. CC-101"
                                                value={newExpenseCostCode}
                                                onChange={e => setNewExpenseCostCode(e.target.value)}
                                            />
                                        </div>
                                        <button
                                            onClick={handleAddExpense}
                                            className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2 rounded text-[13px] font-medium transition-colors"
                                        >
                                            Add Expense
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Expense List - Compact */}
                        <div className="md:col-span-2">
                            <div className="bg-white rounded border border-gray-200 flex flex-col h-[500px]">
                                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                                    <h3 className="text-sm font-semibold text-gray-800">Expense History</h3>
                                    <span className="text-[13px] tabular-nums text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded">
                                        Total: {formatMoney(stats.actualCostToDate)}
                                    </span>
                                </div>
                                <div className="flex-1 overflow-y-auto">
                                    {filteredExpenses.length === 0 ? (
                                        <div className="p-8 text-center text-gray-400 text-[13px] italic">No expenses recorded yet.</div>
                                    ) : (
                                        <table className="w-full text-[13px] text-left">
                                            <thead className="text-[13px] text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100 sticky top-0 backdrop-blur-sm">
                                                <tr>
                                                    <th className="px-4 py-2 font-semibold">Date</th>
                                                    <th className="px-4 py-2 font-semibold">Description</th>
                                                    <th className="px-4 py-2 font-semibold">Cost Code</th>
                                                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                                                    <th className="px-4 py-2 text-center font-semibold w-[50px]"></th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {[...filteredExpenses].sort((a, b) => b.date.localeCompare(a.date)).map(exp => (
                                                    <tr key={exp.id} className="hover:bg-gray-50 group">
                                                        <td className="px-4 py-2 text-gray-600 border-l-2 border-transparent group-hover:border-blue-500 transition-colors">
                                                            {formatExpenseDate(exp.date)}
                                                        </td>
                                                        <td className="px-4 py-2 font-medium text-gray-900">{exp.description}</td>
                                                        <td className="px-4 py-2 text-gray-600 tabular-nums">{exp.costCode || UNASSIGNED_COST_CODE}</td>
                                                        <td className="px-4 py-2 text-right text-rose-600 tabular-nums">{formatMoney(exp.amount)}</td>
                                                        <td className="px-4 py-2 text-center">
                                                            <button
                                                                onClick={() => handleDeleteExpense(exp.id)}
                                                                className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'costcode' && (
                    <div className="bg-white rounded border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-gray-800">Cost Code Performance</h3>
                            <span className="text-[13px] tabular-nums text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded">
                                Codes: {costCodeReport.breakdown.length}
                            </span>
                        </div>
                        <div className="overflow-x-auto">
                            {costCodeReport.breakdown.length === 0 ? (
                                <div className="p-8 text-center text-gray-400 text-[13px] italic">No cost code data available.</div>
                            ) : (
                                <table className="w-full text-[13px] text-left text-gray-600">
                                    <thead className="text-[13px] text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                        <tr>
                                            <th className="px-4 py-2 font-semibold text-gray-700">Cost Code</th>
                                            <th className="px-4 py-2 text-right font-semibold text-blue-700">Planned (PV)</th>
                                            <th className="px-4 py-2 text-right font-semibold text-emerald-700">Earned (EV)</th>
                                            <th className="px-4 py-2 text-right font-semibold text-rose-700">Actual (AC)</th>
                                            <th className="px-4 py-2 text-right font-semibold text-gray-700">Variance</th>
                                            <th className="px-4 py-2 text-center font-semibold text-gray-700">CPI</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        <tr className="bg-slate-50 font-semibold text-slate-900 border-b border-gray-200">
                                            <td className="px-4 py-2.5">TOTAL</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(costCodeReport.totals.planned)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(costCodeReport.totals.earned)}</td>
                                            <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(costCodeReport.totals.actual)}</td>
                                            <td className={`px-4 py-2.5 text-right tabular-nums ${(costCodeReport.totals.earned - costCodeReport.totals.actual) >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                {(costCodeReport.totals.earned - costCodeReport.totals.actual) >= 0 ? '+' : ''}
                                                {formatMoney(costCodeReport.totals.earned - costCodeReport.totals.actual)}
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-bold">
                                                {costCodeReport.totals.actual > 0
                                                    ? (costCodeReport.totals.earned / costCodeReport.totals.actual).toFixed(2)
                                                    : '0.00'}
                                            </td>
                                        </tr>
                                        {costCodeReport.breakdown.map(row => (
                                            <tr key={row.costCode} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-2 font-medium text-gray-900">
                                                    {row.costCode}
                                                    <div className="text-[13px] text-gray-400 font-normal">
                                                        {COST_CODE_NAME_MAP[row.costCode] || '-'}
                                                    </div>
                                                    <div className="text-[13px] text-gray-400 font-normal">
                                                        Tasks: {row.taskCount} | Expenses: {row.expenseCount}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[13px]">{formatMoney(row.planned)}</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[13px]">{formatMoney(row.earned)}</td>
                                                <td className="px-4 py-2 text-right tabular-nums text-[13px]">{formatMoney(row.actual)}</td>
                                                <td className={`px-4 py-2 text-right tabular-nums text-[13px] font-medium ${row.variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {row.variance >= 0 ? '+' : ''}{formatMoney(row.variance)}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <span className={`text-[13px] font-bold ${row.cpi >= 1 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                        {row.cpi.toFixed(2)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'table' && (
                    <div className="bg-white rounded border border-gray-200 overflow-hidden">
                        <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                            <h3 className="text-sm font-semibold text-gray-800">Project Performance Summary</h3>
                            <button className="text-[13px] text-blue-600 hover:text-blue-700 font-medium">Export CSV</button>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-[13px] text-left text-gray-600">
                                <thead className="text-[13px] text-gray-500 uppercase bg-gray-50/50 border-b border-gray-100">
                                    <tr>
                                        <th className="px-4 py-2 font-semibold text-gray-700">Project Name</th>
                                        <th className="px-4 py-2 text-right font-semibold text-blue-700">Planned (PV)</th>
                                        <th className="px-4 py-2 text-right font-semibold text-emerald-700">Earned (EV)</th>
                                        <th className="px-4 py-2 text-right font-semibold text-rose-700">Actual (AC)</th>
                                        <th className="px-4 py-2 text-right font-semibold text-gray-700">Variance (EV-AC)</th>
                                        <th className="px-4 py-2 text-center font-semibold text-gray-700">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {/* Summary Row */}
                                    <tr className="bg-slate-50 font-semibold text-slate-900 border-b border-gray-200">
                                        <td className="px-4 py-2.5">TOTAL (All Projects)</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(stats.plannedToDate)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(stats.earnedToDate)}</td>
                                        <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(stats.actualCostToDate)}</td>
                                        <td className={`px-4 py-2.5 text-right tabular-nums ${stats.costVariance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                                            {stats.costVariance > 0 ? '+' : ''}{formatMoney(stats.costVariance)}
                                        </td>
                                        <td className="px-4 py-2.5 text-center">
                                            <span className={`px-1.5 py-0.5 rounded text-[13px] font-bold ${stats.costVariance >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                                                {stats.costVariance >= 0 ? 'ON BUDGET' : 'OVER BUDGET'}
                                            </span>
                                        </td>
                                    </tr>

                                    {/* Project Rows */}
                                    {projects.map(project => {
                                        if (selectedProjectId !== 'all' && project.id !== selectedProjectId) return null;

                                        // Calculate stats per project
                                        const projTasks = tasks.filter(t => t.projectId === project.id);
                                        const projExpenses = expenses.filter(e => e.projectId === project.id);

                                        let pPV = 0; // Planned Value
                                        let pEV = 0; // Earned Value
                                        let pAC = 0; // Actual Cost

                                        projTasks.forEach(task => {
                                            if (task.type === 'group') return;
                                            const cost = task.cost || 0;
                                            const progress = task.progress || 0;

                                            // EV Calculation
                                            pEV += (cost * progress) / 100;

                                            // PV Calculation
                                            if (task.planStartDate && task.planEndDate) {
                                                const start = parseISO(task.planStartDate);
                                                const end = parseISO(task.planEndDate);
                                                const now = currentDate;

                                                if (isValid(start) && isValid(end) && end.getTime() >= start.getTime()) {
                                                    const totalDuration = end.getTime() - start.getTime();
                                                    // Use end of current day for PV calculation to be consistent
                                                    const checkDate = endOfDay(now);

                                                    if (checkDate >= end) {
                                                        pPV += cost; // Past task, full value
                                                    } else if (checkDate < start) {
                                                        pPV += 0; // Future task, no value
                                                    } else {
                                                        // Ongoing task
                                                        const passedDuration = checkDate.getTime() - start.getTime();
                                                        const percentPlanned = totalDuration === 0 ? 1 : (passedDuration / totalDuration);
                                                        pPV += cost * percentPlanned;
                                                    }
                                                }
                                            }
                                        });

                                        projExpenses.forEach(e => pAC += e.amount);

                                        const variance = pEV - pAC;
                                        const isProfitable = variance >= 0;
                                        const cpi = pAC > 0 ? pEV / pAC : 0;

                                        return (
                                            <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                                                <td className="px-4 py-2 font-medium text-gray-900 border-l-2 border-transparent hover:border-blue-500">
                                                    {project.name}
                                                    <div className="text-[13px] text-gray-400 font-normal">{project.code}</div>
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-600 tabular-nums text-[13px]">
                                                    {formatMoney(pPV)}
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-600 tabular-nums text-[13px]">
                                                    {formatMoney(pEV)}
                                                </td>
                                                <td className="px-4 py-2 text-right text-gray-600 tabular-nums text-[13px]">
                                                    {formatMoney(pAC)}
                                                </td>
                                                <td className={`px-4 py-2 text-right tabular-nums text-[13px] font-medium ${isProfitable ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {isProfitable ? '+' : ''}{formatMoney(variance)}
                                                </td>
                                                <td className="px-4 py-2 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className={`text-[13px] font-bold ${isProfitable ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                            CPI: {cpi.toFixed(2)}
                                                        </span>
                                                        <span className="text-[13px] text-gray-400 uppercase">{isProfitable ? 'Good' : 'Alert'}</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

