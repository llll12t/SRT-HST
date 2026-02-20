'use client';

import React, { useState, useEffect } from 'react';
import {
    Download,
    Calendar,
    FileText,
    BarChart3,
    TrendingUp,
    Loader2,
    CheckCircle2,
    AlertCircle,
    Building2,
    Printer,
    Filter
} from 'lucide-react';
import { Project, Task } from '@/types/construction';
import { getProjects, getAllTasks } from '@/lib/firestore';
import {
    format,
    addDays,
    isBefore,
    isAfter,
    isValid,
    parseISO,
    startOfDay,
    endOfDay,
    startOfMonth,
    endOfMonth,
    eachMonthOfInterval,
    differenceInDays,
    differenceInCalendarDays
} from 'date-fns';
import { th } from 'date-fns/locale';

// --- Report Types & Tabs ---
type ReportTab = 'portfolio' | 'performance' | 'lookahead';

export default function ReportsPage() {
    // State
    const [activeTab, setActiveTab] = useState<ReportTab>('portfolio');
    const [projects, setProjects] = useState<Project[]>([]);
    const [allTasks, setAllTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // Selecting specific project for detailed reports
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    // Load Data
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [projectsData, tasksData] = await Promise.all([
                    getProjects(),
                    getAllTasks()
                ]);
                setProjects(projectsData);
                setAllTasks(tasksData);

                // Set default selected project if available
                if (projectsData.length > 0) {
                    setSelectedProjectId(projectsData[0].id);
                }
            } catch (error) {
                console.error("Error loading report data:", error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, []);

    // --- Data Processing Helpers ---
    const isLeafTask = (task: Task) => task.type !== 'group';

    const getBudget = (project: Project): number => {
        const withBudget = project as Project & { budget?: number };
        return Number(withBudget.budget || 0);
    };

    const parseSafeDate = (value?: string) => {
        if (!value) return null;
        const parsed = parseISO(value);
        return isValid(parsed) ? parsed : null;
    };

    const getTaskWindow = (task: Task) => {
        const start = parseSafeDate(task.planStartDate);
        const end = parseSafeDate(task.planEndDate);
        if (!start || !end) return null;
        return {
            start: startOfDay(start),
            end: endOfDay(end)
        };
    };

    const getTaskWeight = (task: Task) => {
        const costWeight = Number(task.cost || 0);
        if (costWeight > 0) return costWeight;
        return Math.max(1, Number(task.planDuration) || 1);
    };

    const clampProgress = (value?: number) => Math.max(0, Math.min(100, Number(value) || 0));

    const getProjectLeafTasks = (projectId: string) => allTasks.filter((task) => task.projectId === projectId && isLeafTask(task));

    const calculatePlanProgressAtDate = (tasks: Task[], referenceDate: Date) => {
        if (tasks.length === 0) return 0;

        const targetDate = endOfDay(referenceDate);
        let totalWeight = 0;
        let earnedWeight = 0;

        tasks.forEach((task) => {
            const window = getTaskWindow(task);
            if (!window) return;

            const weight = getTaskWeight(task);
            totalWeight += weight;

            if (isBefore(targetDate, window.start)) return;

            if (!isBefore(targetDate, window.end)) {
                earnedWeight += weight;
                return;
            }

            const totalDuration = Math.max(1, differenceInDays(window.end, window.start) + 1);
            const elapsed = Math.max(0, differenceInDays(targetDate, window.start) + 1);
            const ratio = Math.max(0, Math.min(1, elapsed / totalDuration));
            earnedWeight += weight * ratio;
        });

        return totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
    };

    const getTaskProgressAtDate = (task: Task, referenceDate: Date) => {
        const targetDate = endOfDay(referenceDate);
        const progressDate = parseSafeDate(task.progressUpdatedAt);
        const actualStart = parseSafeDate(task.actualStartDate);

        if (progressDate && isBefore(targetDate, startOfDay(progressDate))) return 0;
        if (!progressDate && actualStart && isBefore(targetDate, startOfDay(actualStart))) return 0;

        return clampProgress(task.progress);
    };

    const calculateActualProgressAtDate = (tasks: Task[], referenceDate: Date) => {
        if (tasks.length === 0) return 0;

        let totalWeight = 0;
        let earnedWeight = 0;

        tasks.forEach((task) => {
            const window = getTaskWindow(task);
            if (!window) return;

            const weight = getTaskWeight(task);
            totalWeight += weight;
            earnedWeight += (weight * getTaskProgressAtDate(task, referenceDate)) / 100;
        });

        return totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
    };

    const calculatePlanProgress = (tasks: Task[]) => calculatePlanProgressAtDate(tasks, new Date());
    const calculateActualProgress = (tasks: Task[]) => calculateActualProgressAtDate(tasks, new Date());

    const calculateDelayDays = (planEndDate: string) => {
        const endDate = parseSafeDate(planEndDate);
        if (!endDate) return 0;
        return Math.max(0, differenceInCalendarDays(startOfDay(new Date()), startOfDay(endDate)));
    };

    const getMonthlyProgressRows = (project: Project | undefined, tasks: Task[]) => {
        if (!project || tasks.length === 0) return [];

        const projectStart = parseSafeDate(project.startDate);
        const projectEnd = parseSafeDate(project.endDate);
        if (!projectStart || !projectEnd) return [];

        const today = new Date();
        const intervalStart = startOfMonth(projectStart);
        const intervalEndCandidate = endOfMonth(projectEnd);
        const currentMonthEnd = endOfMonth(today);
        const intervalEnd = isBefore(intervalEndCandidate, currentMonthEnd) ? intervalEndCandidate : currentMonthEnd;

        if (isAfter(intervalStart, intervalEnd)) return [];

        return eachMonthOfInterval({ start: intervalStart, end: intervalEnd }).map((monthStartDate) => {
            const monthEndDate = endOfMonth(monthStartDate);
            const referenceDate = isAfter(monthEndDate, today) ? today : monthEndDate;
            const monthKey = format(monthStartDate, 'yyyy-MM');
            return {
                monthKey,
                label: format(monthStartDate, 'MMMM yyyy', { locale: th }),
                planProgress: calculatePlanProgressAtDate(tasks, referenceDate),
                actualProgress: calculateActualProgressAtDate(tasks, referenceDate),
                isCurrent: monthKey === format(today, 'yyyy-MM')
            };
        });
    };

    const getPortfolioStats = () => {
        return projects.map((project) => {
            const projectTasks = getProjectLeafTasks(project.id);
            const totalTasks = projectTasks.length;
            const completedTasks = projectTasks.filter((task) => task.status === 'completed').length;
            const planProgress = calculatePlanProgress(projectTasks);
            const actualProgress = totalTasks > 0 ? calculateActualProgress(projectTasks) : Number(project.overallProgress || 0);
            const variance = actualProgress - planProgress;

            let statusColor = 'bg-green-100 text-green-700';
            let statusText = 'On Track';

            if (variance < -10) {
                statusColor = 'bg-red-100 text-red-700';
                statusText = 'Critical Delay';
            } else if (variance < -5) {
                statusColor = 'bg-amber-100 text-amber-700';
                statusText = 'Delayed';
            } else if (variance > 5) {
                statusColor = 'bg-blue-100 text-blue-700';
                statusText = 'Ahead of Plan';
            }

            return {
                ...project,
                planProgress,
                actualProgress,
                variance,
                statusColor,
                statusText,
                totalTasks,
                completedTasks
            };
        });
    };

    const getLookaheadTasks = (days: number) => {
        if (!selectedProjectId) return [];
        const rangeStart = startOfDay(new Date());
        const rangeEnd = endOfDay(addDays(rangeStart, days));

        return getProjectLeafTasks(selectedProjectId)
            .filter((task) => task.status !== 'completed')
            .filter((task) => {
                const window = getTaskWindow(task);
                if (!window) return false;
                if (isBefore(window.end, rangeStart)) return false;
                if (isAfter(window.start, rangeEnd)) return false;
                return true;
            })
            .sort((a, b) => {
                const startA = parseSafeDate(a.planStartDate);
                const startB = parseSafeDate(b.planStartDate);
                return (startA?.getTime() || 0) - (startB?.getTime() || 0);
            });
    };

    const getDelayedTasks = () => {
        if (!selectedProjectId) return [];
        const todayStart = startOfDay(new Date());

        return getProjectLeafTasks(selectedProjectId)
            .filter((task) => task.status !== 'completed')
            .filter((task) => {
                const window = getTaskWindow(task);
                if (!window) return false;
                return isBefore(window.end, todayStart);
            });
    };


    // --- Export & Print Logic ---

    const toCsvCell = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

    const handleExportExcel = () => {
        let csvContent = "";
        let fileName = "";
        const today = format(new Date(), 'yyyy-MM-dd');

        if (activeTab === 'portfolio') {
            const data = getPortfolioStats();
            fileName = `Portfolio_Report_${today}.csv`;
            csvContent += "No,Project,Owner,Planned(%),Actual(%),Variance(%),Status,Contract End Date\n";
            data.forEach((p, idx) => {
                csvContent += [
                    idx + 1,
                    toCsvCell(p.name),
                    toCsvCell(p.owner),
                    p.planProgress.toFixed(2),
                    p.actualProgress.toFixed(2),
                    p.variance.toFixed(2),
                    toCsvCell(p.statusText),
                    toCsvCell(format(new Date(p.endDate), 'dd/MM/yyyy'))
                ].join(',') + '\n';
            });
        } else if (activeTab === 'performance' && selectedProjectId) {
            const selectedProject = projects.find((project) => project.id === selectedProjectId);
            if (!selectedProject) {
                alert('Project not found');
                return;
            }

            const projectTasks = getProjectLeafTasks(selectedProjectId);
            const monthlyRows = getMonthlyProgressRows(selectedProject, projectTasks);
            const actualProgress = projectTasks.length > 0 ? calculateActualProgress(projectTasks) : Number(selectedProject.overallProgress || 0);
            const planProgress = calculatePlanProgress(projectTasks);

            fileName = `Performance_Report_${selectedProjectId}_${today}.csv`;
            csvContent += `Project,${toCsvCell(selectedProject.name)}\n`;
            csvContent += `Owner,${toCsvCell(selectedProject.owner)}\n`;
            csvContent += `Actual Progress (%),${actualProgress.toFixed(2)}\n`;
            csvContent += `Planned Progress (%),${planProgress.toFixed(2)}\n`;
            csvContent += `Variance (%),${(actualProgress - planProgress).toFixed(2)}\n`;
            csvContent += `Generated At,${toCsvCell(format(new Date(), 'dd/MM/yyyy HH:mm'))}\n\n`;

            csvContent += "Monthly Progress\n";
            csvContent += "Month,Planned(%),Actual(%)\n";
            monthlyRows.forEach((row) => {
                csvContent += `${toCsvCell(row.label)},${row.planProgress.toFixed(2)},${row.actualProgress.toFixed(2)}\n`;
            });

            csvContent += "\nTask Details\n";
            csvContent += "Category,Task,Plan Start,Plan End,Plan Duration (days),Progress(%),Status\n";
            projectTasks
                .slice()
                .sort((a, b) => {
                    const dateA = parseSafeDate(a.planStartDate);
                    const dateB = parseSafeDate(b.planStartDate);
                    return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                })
                .forEach((task) => {
                    csvContent += [
                        toCsvCell(task.category || '-'),
                        toCsvCell(task.name),
                        toCsvCell(task.planStartDate || '-'),
                        toCsvCell(task.planEndDate || '-'),
                        task.planDuration || 0,
                        clampProgress(task.progress).toFixed(2),
                        toCsvCell(task.status || '-')
                    ].join(',') + '\n';
                });
        } else if (activeTab === 'lookahead') {
            const data = getLookaheadTasks(30);
            fileName = `Lookahead_30Days_${today}.csv`;
            csvContent += "Start Date,Task,Category,Duration (days),Quantity,Status\n";
            data.forEach((task) => {
                csvContent += [
                    toCsvCell(format(new Date(task.planStartDate), 'dd/MM/yyyy')),
                    toCsvCell(task.name),
                    toCsvCell(task.category),
                    task.planDuration || 1,
                    toCsvCell(task.quantity || ''),
                    toCsvCell(task.status)
                ].join(',') + '\n';
            });
        } else {
            alert('Please select a report tab before export');
            return;
        }

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = fileName;
        link.click();
    };

    // --- Render Helpers ---

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[60vh]">
                <Loader2 className="w-10 h-10 text-blue-600 animate-spin mb-4" />
                <p className="text-gray-500">กำลังประมวลผลข้อมูลรายงาน...</p>
            </div>
        );
    }

    const portfolioData = getPortfolioStats();

    const selectedProjectData = projects.find(p => p.id === selectedProjectId);
    const selectedProjectTasks = selectedProjectData ? getProjectLeafTasks(selectedProjectData.id) : [];
    const selectedProjectActualProgress = selectedProjectTasks.length > 0
        ? calculateActualProgress(selectedProjectTasks)
        : Number(selectedProjectData?.overallProgress || 0);
    const monthlyProgressRows = getMonthlyProgressRows(selectedProjectData, selectedProjectTasks);
    const lookaheadTasks = getLookaheadTasks(30);
    const delayedTasks = getDelayedTasks();

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 print:p-0 print:max-w-none print:space-y-4">
            {/* Print Styles */}
            <style jsx global>{`
                @media print {
                    @page { 
                        size: A4 portrait; 
                        margin: 10mm 15mm; 
                    }
                    body { 
                        -webkit-print-color-adjust: exact !important; 
                        print-color-adjust: exact !important; 
                        background: white !important;
                        font-family: 'Sarabun', sans-serif;
                        font-size: 10pt;
                    }
                    
                    /* Hide UI Elements */
                    nav, button, select, .no-print, header, .print-hidden { 
                        display: none !important; 
                    }
                    
                    /* Compact Layout for Portrait */
                    .space-y-6 > * { margin-bottom: 2mm !important; }
                    .max-w-7xl { max-width: none !important; margin: 0 !important; padding: 0 !important; }
                    .shadow-sm, .shadow-md { box-shadow: none !important; }
                    .rounded-xl, .rounded-lg, .rounded { border-radius: 0 !important; border: none !important; }
                    .border { border: none !important; }
                    
                    /* Summary Cards (Top) - Force Compact Row */
                    .grid { display: flex !important; gap: 10px !important; flex-wrap: wrap !important; }
                    .grid > div { 
                        flex: 1; 
                        border: 1px solid #ddd !important;
                        padding: 10px !important;
                        margin-bottom: 10px;
                        background: #f9f9f9 !important;
                    }
                    /* Specific override for 3 columns on portrait */
                    .md\\:grid-cols-3 > div, .lg\\:grid-cols-3 > div {
                         min-width: 30%;
                    }

                    /* Tables - High Density */
                    table { 
                        width: 100% !important; 
                        border-collapse: collapse !important; 
                        border: 1px solid #999 !important;
                        font-size: 9pt !important;
                        margin-top: 5px !important;
                    }
                    th {
                        background-color: #eee !important;
                        color: black !important;
                        border: 1px solid #999 !important;
                        padding: 4px 2px !important;
                        text-align: center !important;
                        font-weight: bold !important;
                        white-space: normal !important; /* Allow wrap headers in portrait */
                        vertical-align: middle !important;
                    }
                    td { 
                        border: 1px solid #999 !important; 
                        padding: 4px 2px !important;
                        vertical-align: top !important;
                        color: black !important;
                        word-wrap: break-word;
                    }
                    tr { page-break-inside: avoid; }

                    /* Text sizes */
                    h1 { font-size: 14pt !important; margin-bottom: 2px !important; }
                    h2 { font-size: 12pt !important; margin-bottom: 2px !important; }
                    .text-3xl { font-size: 14pt !important; } /* Shrink big numbers */
                    .text-lg, .text-xl { font-size: 11pt !important; }
                    .text-sm { font-size: 9pt !important; }
                    .text-xs { font-size: 8pt !important; }

                    /* Header / Footer */
                    .print-only { display: block !important; }
                    .report-header {
                        text-align: center;
                        margin-bottom: 15px;
                        border-bottom: 1px solid #000;
                        padding-bottom: 5px;
                    }
                    
                    /* Badges & Indicators */
                    .badge, span[class*="bg-"] {
                        background: transparent !important;
                        color: black !important;
                        border: none !important;
                        padding: 0 !important;
                        font-weight: normal !important;
                    }
                    
                    /* Progress Bars - Make thinner or hide */
                    .h-2, .h-2.5 { height: 4px !important; }
                }
                .print-only { display: none; }
            `}</style>

            {/* Header (Screen Only) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200 pb-6 print:hidden">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FileText className="w-7 h-7 text-blue-600" />
                        ระบบรายงาน (Project Intelligence)
                    </h1>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => window.print()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-sm text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-none transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        พิมพ์รายงาน
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-sm text-sm font-medium hover:bg-blue-700 shadow-none transition-colors"
                    >
                        <Download className="w-4 h-4" />
                        Export Excel
                    </button>
                </div>
            </div>

            {/* Official Report Header (Print Only) */}
            <div className="print-only report-header">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <Building2 className="w-6 h-6" />
                    <h1 className="font-bold text-xl uppercase">บริษัท เอสอาร์ที-เอชเอสที ก่อสร้าง จำกัด (SRT-HST CONSTRUCTION)</h1>
                </div>
                <h2 className="text-lg font-semibold mt-2">
                    {activeTab === 'portfolio' ? 'รายงานสรุปสถานะโครงการประจำสัปดาห์ (Weekly Portfolio Report)' :
                        activeTab === 'performance' ? `รายงานความก้าวหน้าโครงการ: ${selectedProjectData?.name || ''}` :
                            'รายงานแผนงานล่วงหน้า 30 วัน (30-Day Lookahead Plan)'}
                </h2>
                <div className="flex justify-between text-sm text-gray-600 mt-2 border-t border-dotted border-gray-400 pt-2 w-full max-w-2xl mx-auto">
                    <span>วันที่ออกรายงาน: {format(new Date(), 'd MMMM yyyy เวลา HH:mm น.', { locale: th })}</span>
                    <span>ผู้จัดทำ: Admin User</span>
                </div>
            </div>

            {/* Navigation Tabs */}
            <div className="flex flex-col sm:flex-row gap-4">
                <button
                    onClick={() => setActiveTab('portfolio')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm whitespace-nowrap transition-all ${activeTab === 'portfolio'
                        ? 'bg-gray-100 text-gray-900 border border-gray-300'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <Building2 className="w-4 h-4" />
                    ภาพรวมพอร์ตโฟลิโอ (Executive)
                </button>
                <button
                    onClick={() => setActiveTab('performance')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm whitespace-nowrap transition-all ${activeTab === 'performance'
                        ? 'bg-gray-100 text-gray-900 border border-gray-300'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <TrendingUp className="w-4 h-4" />
                    วิเคราะห์ผลการดำเนินงาน (Performance)
                </button>
                <button
                    onClick={() => setActiveTab('lookahead')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-sm whitespace-nowrap transition-all ${activeTab === 'lookahead'
                        ? 'bg-gray-100 text-gray-900 border border-gray-300'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <Calendar className="w-4 h-4" />
                    แผนงานล่วงหน้า (Lookahead)
                </button>
            </div>

            {/* --- TAB CONTENT: PORTFOLIO --- */}
            {
                activeTab === 'portfolio' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="bg-white rounded-sm border border-gray-300 shadow-none overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">สรุปสถานะทุกโครงการ (Portfolio Summary)</h3>
                                    <p className="text-sm text-gray-500">ข้อมูล ณ วันที่ {format(new Date(), 'd MMMM yyyy', { locale: th })}</p>
                                </div>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium">
                                        <tr>
                                            <th className="px-6 py-4">ชื่อโครงการ</th>
                                            <th className="px-6 py-4">เจ้าของโครงการ</th>
                                            <th className="px-6 py-4 text-center">แผนงานสะสม (%)</th>
                                            <th className="px-6 py-4 text-center">ผลงานจริง (%)</th>
                                            <th className="px-6 py-4 text-center">Variance (%)</th>
                                            <th className="px-6 py-4 text-center">สถานะ</th>
                                            <th className="px-6 py-4 text-center">วันสิ้นสุดสัญญา</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {portfolioData.map((project) => (
                                            <tr key={project.id} className="hover:bg-gray-50/50 transition-colors">
                                                <td className="px-6 py-4 font-medium text-gray-900">
                                                    {project.name}
                                                    <div className="text-xs text-gray-400 font-normal mt-0.5">{project.code || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{project.owner}</td>
                                                <td className="px-6 py-4 text-center font-medium text-gray-600">
                                                    {project.planProgress.toFixed(2)}%
                                                </td>
                                                <td className="px-6 py-4 text-center font-bold text-gray-900">
                                                    {project.actualProgress.toFixed(2)}%
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded-sm text-xs font-semibold
                                                    ${project.variance >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                                                `}>
                                                        {project.variance > 0 ? '+' : ''}{project.variance.toFixed(2)}%
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-medium border ${project.statusColor} bg-opacity-10 border-opacity-20`}>
                                                        {project.statusText}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center text-gray-600">
                                                    {format(new Date(project.endDate), 'dd/MM/yyyy')}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="bg-white p-6 rounded-sm border border-gray-300 shadow-none">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">โครงการทั้งหมด</h4>
                                <div className="text-3xl font-bold text-gray-900">{portfolioData.length}</div>
                                <div className="mt-4 h-2 bg-gray-100 rounded-sm overflow-hidden">
                                    <div className="h-full bg-blue-500 w-full"></div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-sm border border-gray-300 shadow-none">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">โครงการล่าช้า</h4>
                                <div className="text-3xl font-bold text-red-600">
                                    {portfolioData.filter(p => p.variance < -5).length}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">ต้องเฝ้าระวังเป็นพิเศษ</div>
                            </div>
                            <div className="bg-white p-6 rounded-sm border border-gray-300 shadow-none">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">มูลค่ารวม (Budget)</h4>
                                <div className="text-3xl font-bold text-gray-900">
                                    {projects.reduce((sum, p) => sum + getBudget(p), 0).toLocaleString()} <span className="text-sm font-normal text-gray-500">บาท</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* --- TAB CONTENT: PERFORMANCE --- */}
            {
                activeTab === 'performance' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Project Selector */}
                        <div className="flex items-center gap-4 bg-white p-4 rounded-sm border border-gray-300 shadow-none">
                            <Filter className="w-5 h-5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">เลือกโครงการ:</span>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-white border border-gray-300 text-gray-900 text-sm rounded-sm focus:border-black block p-2.5 min-w-[250px]"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {selectedProjectData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* EVM / Status Card */}
                                <div className="bg-white p-6 rounded-sm border border-gray-300 shadow-none relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{selectedProjectData.name}</h3>
                                            <p className="text-sm text-gray-500">รหัส: {selectedProjectData.code || '-'}</p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-sm text-xs font-semibold ${selectedProjectActualProgress >= 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {selectedProjectData.status.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 mb-6">
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">ความคืบหน้าจริง (Actual)</p>
                                            <p className="text-4xl font-bold text-blue-600">{selectedProjectActualProgress.toFixed(2)}%</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">ระยะเวลาดำเนินงาน</p>
                                            <p className="text-xl font-semibold text-gray-900">
                                                {format(new Date(selectedProjectData.startDate), 'dd MMM yy')} - {format(new Date(selectedProjectData.endDate), 'dd MMM yy')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-sm p-4 border border-gray-200">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4" />
                                            การเบิกจ่ายงบประมาณ (Financial Progress)
                                        </h4>
                                        <div className="w-full bg-gray-200 rounded-sm h-2.5 mb-1">
                                            <div className="bg-green-500 h-2.5 rounded-sm" style={{ width: `${selectedProjectActualProgress}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>ใช้งบไปแล้ว: estimate {(getBudget(selectedProjectData) * (selectedProjectActualProgress / 100)).toLocaleString()} บาท</span>
                                            <span>งบทั้งหมด: {getBudget(selectedProjectData).toLocaleString()} บาท</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Monthly Progress Table (Simplified S-Curve Data Table) */}
                                <div className="bg-white p-6 rounded-sm border border-gray-300 shadow-none">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                                        <BarChart3 className="w-5 h-5 text-gray-500" />
                                        ตารางความก้าวหน้ารายเดือน (Monthly Progress)
                                    </h3>

                                    <div className="overflow-x-auto">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-500">
                                                <tr>
                                                    <th className="px-4 py-3 rounded-l-lg">เดือน</th>
                                                    <th className="px-4 py-3 text-center">แผนสะสม (%)</th>
                                                    <th className="px-4 py-3 text-center rounded-r-lg">ผลงานจริง (%)</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {monthlyProgressRows.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={3} className="px-4 py-6 text-center text-gray-500">
                                                            ไม่มีข้อมูลรายเดือนสำหรับโครงการนี้
                                                        </td>
                                                    </tr>
                                                ) : (
                                                    monthlyProgressRows.map((row) => (
                                                        <tr key={row.monthKey} className={row.isCurrent ? 'bg-blue-50/50' : ''}>
                                                            <td className={`px-4 py-3 font-medium ${row.isCurrent ? 'text-blue-800' : ''}`}>
                                                                {row.isCurrent ? `${row.label} (Current)` : row.label}
                                                            </td>
                                                            <td className={`px-4 py-3 text-center ${row.isCurrent ? 'text-blue-800 font-bold' : 'text-gray-600'}`}>
                                                                {row.planProgress.toFixed(2)}%
                                                            </td>
                                                            <td className={`px-4 py-3 text-center font-semibold ${row.isCurrent ? 'text-blue-600' : 'text-gray-700'}`}>
                                                                {row.actualProgress.toFixed(2)}%
                                                            </td>
                                                        </tr>
                                                    ))
                                                )}
                                            </tbody>
                                        </table>
                                        <div className="mt-4 text-xs text-gray-400 text-center">
                                            * ข้อมูลรายเดือนคำนวณจากงานจริงในระบบ (ตัดงานประเภท group ออก)
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="p-10 text-center text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-300">
                                กรุณาเลือกโครงการเพื่อนดูรายงานละเอียด
                            </div>
                        )}
                    </div>
                )
            }


            {/* --- TAB CONTENT: LOOKAHEAD --- */}
            {
                activeTab === 'lookahead' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Project Selector Reuse */}
                        <div className="flex items-center gap-4 bg-white p-4 rounded-sm border border-gray-300 shadow-none">
                            <Filter className="w-5 h-5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">เลือกโครงการ:</span>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-white border border-gray-300 text-gray-900 text-sm rounded-sm focus:border-black block p-2.5 min-w-[250px]"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* DELAYED TASKS (Critical Actions) */}
                            <div className="bg-white rounded-sm border border-red-300 shadow-none overflow-hidden lg:col-span-1">
                                <div className="bg-red-50 p-4 border-b border-red-100 flex items-center justify-between">
                                    <h3 className="font-bold text-red-800 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5" />
                                        งานล่าช้า (Action Required)
                                    </h3>
                                    <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-sm">
                                        {delayedTasks.length} งาน
                                    </span>
                                </div>
                                <div className="p-0 max-h-[500px] overflow-y-auto">
                                    {delayedTasks.length === 0 ? (
                                        <div className="p-8 text-center text-gray-500">
                                            <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto mb-2" />
                                            <p>ยอดเยี่ยม! ไม่มีงานล่าช้า</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-red-50">
                                            {delayedTasks.map(task => (
                                                <div key={task.id} className="p-4 hover:bg-red-50/30 transition-colors group">
                                                    <div className="flex justify-between items-start mb-1">
                                                        <h4 className="text-sm font-semibold text-gray-900 group-hover:text-red-700 transition-colors">
                                                            {task.name}
                                                        </h4>
                                                        <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded border border-red-200">
                                                            {task.progress}%
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-gray-500 mb-2">{task.category}</p>
                                                    <div className="flex justify-between text-xs text-red-600 font-medium">
                                                        <span>ควรเสร็จเมื่อ: {format(new Date(task.planEndDate), 'dd MMM yy')}</span>
                                                        <span>(-{calculateDelayDays(task.planEndDate)} วัน)</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LOOKAHEAD TASKS */}
                            <div className="bg-white rounded-sm border border-blue-300 shadow-none overflow-hidden lg:col-span-2">
                                <div className="bg-blue-50 p-4 border-b border-blue-100 flex items-center justify-between">
                                    <h3 className="font-bold text-blue-900 flex items-center gap-2">
                                        <Calendar className="w-5 h-5" />
                                        แผนงาน 30 วันข้างหน้า (30-Day Lookahead)
                                    </h3>
                                    <span className="text-xs text-blue-600 font-medium">
                                        {format(new Date(), 'dd MMM')} - {format(addDays(new Date(), 30), 'dd MMM yyyy')}
                                    </span>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-blue-50/50 text-blue-900 font-semibold border-b border-blue-100">
                                            <tr>
                                                <th className="px-4 py-3 text-xs uppercase">วันเริ่ม</th>
                                                <th className="px-4 py-3 text-xs uppercase">กิจกรรม</th>
                                                <th className="px-4 py-3 text-xs uppercase text-center">ระยะเวลา</th>
                                                <th className="px-4 py-3 text-xs uppercase text-center">Volume</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {lookaheadTasks.length === 0 ? (
                                                <tr>
                                                    <td colSpan={4} className="p-8 text-center text-gray-500">
                                                        ไม่มีแผนงานใน 30 วันนี้
                                                    </td>
                                                </tr>
                                            ) : (
                                                lookaheadTasks.map(task => (
                                                    <tr key={task.id} className="hover:bg-blue-50/20">
                                                        <td className="px-4 py-3 whitespace-nowrap text-gray-600 bg-gray-50/30">
                                                            {format(new Date(task.planStartDate), 'dd MMM')}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <p className="font-medium text-gray-900">{task.name}</p>
                                                            <span className="text-xs text-gray-400">{task.category}</span>
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-gray-600">
                                                            {task.planDuration} วัน
                                                        </td>
                                                        <td className="px-4 py-3 text-center text-gray-600">
                                                            {task.quantity || '-'}
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
}
