'use client';

import React, { useState, useEffect } from 'react';
import {
    FileSpreadsheet,
    Download,
    Calendar,
    FileText,
    BarChart3,
    TrendingUp,
    Clock,
    Loader2,
    ChevronRight,
    CheckCircle2,
    AlertCircle,
    ArrowUpRight,
    ArrowDownRight,
    Building2,
    PieChart,
    Printer,
    Filter
} from 'lucide-react';
import { Project, Task } from '@/types/construction';
import { getProjects, getAllTasks, getTasks } from '@/lib/firestore';
import { format, addDays, isWithinInterval, isBefore, isAfter, differenceInDays } from 'date-fns';
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

    // 1. Portfolio Calculate
    const getPortfolioStats = () => {
        return projects.map(p => {
            const pTasks = allTasks.filter(t => t.projectId === p.id);
            const totalTasks = pTasks.length;
            const completedTasks = pTasks.filter(t => t.status === 'completed').length;

            // Calc variance (Simple mock based on progress vs time elapsed or existing data)
            // Real logic: Actual % - Plan %
            // We use 'overallProgress' from project as Actual. 
            // Plan % needs calculation. Simplified:
            const planProgress = calculatePlanProgress(pTasks);
            const actualProgress = p.overallProgress || 0;
            const variance = actualProgress - planProgress;

            let statusColor = 'bg-green-100 text-green-700'; // On Track
            let statusText = 'ปกติ (On Track)';

            if (variance < -10) {
                statusColor = 'bg-red-100 text-red-700';
                statusText = 'ล่าช้าวิกฤต (Critical)';
            } else if (variance < -5) {
                statusColor = 'bg-amber-100 text-amber-700';
                statusText = 'ล่าช้า (Delayed)';
            } else if (variance > 5) {
                statusColor = 'bg-blue-100 text-blue-700';
                statusText = 'เร็วกว่าแผน (Ahead)';
            }

            return {
                ...p,
                planProgress,
                variance,
                statusColor,
                statusText,
                totalTasks,
                completedTasks
            };
        });
    };

    const calculatePlanProgress = (tasks: Task[]) => {
        if (tasks.length === 0) return 0;
        const now = new Date();
        let totalWeight = 0;
        let earnedWeight = 0;

        tasks.forEach(t => {
            // Unweighted: use duration as weight
            // Weighted: use cost
            const weight = t.cost || t.planDuration || 1;
            totalWeight += weight;

            const start = new Date(t.planStartDate);
            const end = new Date(t.planEndDate);

            if (isAfter(now, end)) {
                earnedWeight += weight;
            } else if (isBefore(now, start)) {
                earnedWeight += 0;
            } else {
                const totalDuration = differenceInDays(end, start) + 1;
                const elapsed = differenceInDays(now, start) + 1;
                const ratio = Math.max(0, Math.min(1, elapsed / totalDuration));
                earnedWeight += weight * ratio;
            }
        });

        return totalWeight > 0 ? (earnedWeight / totalWeight) * 100 : 0;
    };


    // 2. Lookahead Logic
    const getLookaheadTasks = (days: number) => {
        if (!selectedProjectId) return [];
        const now = new Date();
        const futureDate = addDays(now, days);

        return allTasks
            .filter(t => t.projectId === selectedProjectId && t.status !== 'completed')
            .filter(t => {
                const start = new Date(t.planStartDate);
                // Task starting within range OR active within range
                return isWithinInterval(start, { start: now, end: futureDate }) ||
                    (isBefore(start, now) && isAfter(new Date(t.planEndDate), now));
            })
            .sort((a, b) => new Date(a.planStartDate).getTime() - new Date(b.planStartDate).getTime());
    };

    // 3. Delayed Tasks
    const getDelayedTasks = () => {
        if (!selectedProjectId) return [];
        const now = new Date();

        return allTasks
            .filter(t => t.projectId === selectedProjectId && t.status !== 'completed')
            .filter(t => {
                const end = new Date(t.planEndDate);
                return isBefore(end, now); // Should be done but not marked completed
            });
    };


    // --- Export & Print Logic ---

    const handleExportExcel = () => {
        let csvContent = "";
        let fileName = "";
        const today = format(new Date(), 'yyyy-MM-dd');

        if (activeTab === 'portfolio') {
            const data = getPortfolioStats();
            fileName = `Portfolio_Report_${today}.csv`;
            csvContent += "ลำดับ,ชื่อโครงการ,เจ้าของโครงการ,แผนงานสะสม(%),ผลงานจริง(%),Variance(%),สถานะ,วันสิ้นสุดสัญญา\n";
            data.forEach((p, idx) => {
                csvContent += `${idx + 1},"${p.name}","${p.owner}",${p.planProgress.toFixed(2)},${p.overallProgress.toFixed(2)},${p.variance.toFixed(2)},"${p.statusText}",${format(new Date(p.endDate), 'dd/MM/yyyy')}\n`;
            });
        } else if (activeTab === 'performance' && selectedProjectId) {
            fileName = `Performance_Report_${selectedProjectId}_${today}.csv`;
            csvContent += "รายงานรายละเอียดอยู่ระหว่างการพัฒนา\n";
            // In real app, export detailed S-curve data here
        } else if (activeTab === 'lookahead') {
            const data = getLookaheadTasks(30);
            fileName = `Lookahead_30Days_${today}.csv`;
            csvContent += "วันที่เริ่ม,กิจกรรม,หมวดหมู่,ระยะเวลา(วัน),ปริมาณงาน\n";
            data.forEach(t => {
                csvContent += `${format(new Date(t.planStartDate), 'dd/MM/yyyy')},"${t.name}","${t.category}",${t.planDuration || 1},"${t.quantity || ''}"\n`;
            });
        } else {
            alert('กรุณาเลือก Tab ที่ต้องการ Export');
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
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
                    >
                        <Printer className="w-4 h-4" />
                        พิมพ์รายงาน
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm transition-colors"
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
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${activeTab === 'portfolio'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <Building2 className="w-4 h-4" />
                    ภาพรวมพอร์ตโฟลิโอ (Executive)
                </button>
                <button
                    onClick={() => setActiveTab('performance')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${activeTab === 'performance'
                        ? 'bg-white text-blue-700 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'
                        }`}
                >
                    <TrendingUp className="w-4 h-4" />
                    วิเคราะห์ผลการดำเนินงาน (Performance)
                </button>
                <button
                    onClick={() => setActiveTab('lookahead')}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all ${activeTab === 'lookahead'
                        ? 'bg-white text-blue-700 shadow-sm'
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
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                                                    <div className="text-xs text-gray-400 font-normal mt-0.5">{(project as any).code || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-gray-600">{project.owner}</td>
                                                <td className="px-6 py-4 text-center font-medium text-gray-600">
                                                    {project.planProgress.toFixed(2)}%
                                                </td>
                                                <td className="px-6 py-4 text-center font-bold text-gray-900">
                                                    {project.overallProgress.toFixed(2)}%
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold
                                                    ${project.variance >= 0 ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}
                                                `}>
                                                        {project.variance > 0 ? '+' : ''}{project.variance.toFixed(2)}%
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${project.statusColor} bg-opacity-10 border-opacity-20`}>
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
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">โครงการทั้งหมด</h4>
                                <div className="text-3xl font-bold text-gray-900">{portfolioData.length}</div>
                                <div className="mt-4 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 w-full"></div>
                                </div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">โครงการล่าช้า</h4>
                                <div className="text-3xl font-bold text-red-600">
                                    {portfolioData.filter(p => p.variance < -5).length}
                                </div>
                                <div className="text-xs text-gray-400 mt-1">ต้องเฝ้าระวังเป็นพิเศษ</div>
                            </div>
                            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                                <h4 className="text-sm font-semibold text-gray-500 mb-2">มูลค่ารวม (Budget)</h4>
                                <div className="text-3xl font-bold text-gray-900">
                                    {projects.reduce((sum, p) => sum + ((p as any).budget || 0), 0).toLocaleString()} <span className="text-sm font-normal text-gray-500">บาท</span>
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
                        <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <Filter className="w-5 h-5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">เลือกโครงการ:</span>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 min-w-[250px]"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        {selectedProjectData ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                {/* EVM / Status Card */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm relative overflow-hidden">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h3 className="text-lg font-bold text-gray-900">{selectedProjectData.name}</h3>
                                            <p className="text-sm text-gray-500">รหัส: {(selectedProjectData as any).code || '-'}</p>
                                        </div>
                                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${selectedProjectData.overallProgress === 100 ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                                            {selectedProjectData.status.toUpperCase()}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-8 mb-6">
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">ความคืบหน้าจริง (Actual)</p>
                                            <p className="text-4xl font-bold text-blue-600">{selectedProjectData.overallProgress.toFixed(2)}%</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-gray-500 mb-1">ระยะเวลาดำเนินงาน</p>
                                            <p className="text-xl font-semibold text-gray-900">
                                                {format(new Date(selectedProjectData.startDate), 'dd MMM yy')} - {format(new Date(selectedProjectData.endDate), 'dd MMM yy')}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                                        <h4 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
                                            <TrendingUp className="w-4 h-4" />
                                            การเบิกจ่ายงบประมาณ (Financial Progress)
                                        </h4>
                                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-1">
                                            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: `${selectedProjectData.overallProgress}%` }}></div>
                                        </div>
                                        <div className="flex justify-between text-xs text-gray-500">
                                            <span>ใช้งบไปแล้ว: estimate {(((selectedProjectData as any).budget || 0) * (selectedProjectData.overallProgress / 100)).toLocaleString()} บาท</span>
                                            <span>งบทั้งหมด: {((selectedProjectData as any).budget || 0).toLocaleString()} บาท</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Monthly Progress Table (Simplified S-Curve Data Table) */}
                                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
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
                                                {/* Mock Data - In real app, calculate monthly snapshots */}
                                                <tr>
                                                    <td className="px-4 py-3 font-medium">มกราคม 2026</td>
                                                    <td className="px-4 py-3 text-center text-gray-600">5.00%</td>
                                                    <td className="px-4 py-3 text-center font-semibold text-blue-600">5.20%</td>
                                                </tr>
                                                <tr>
                                                    <td className="px-4 py-3 font-medium">กุมภาพันธ์ 2026</td>
                                                    <td className="px-4 py-3 text-center text-gray-600">12.50%</td>
                                                    <td className="px-4 py-3 text-center font-semibold text-blue-600">10.15%</td>
                                                </tr>
                                                <tr className="bg-blue-50/50">
                                                    <td className="px-4 py-3 font-medium text-blue-800">ปัจจุบัน (Today)</td>
                                                    <td className="px-4 py-3 text-center text-blue-800 font-bold">
                                                        {portfolioData.find(p => p.id === selectedProjectId)?.planProgress.toFixed(2)}%
                                                    </td>
                                                    <td className="px-4 py-3 text-center font-bold text-blue-600">
                                                        {selectedProjectData.overallProgress.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            </tbody>
                                        </table>
                                        <div className="mt-4 text-xs text-gray-400 text-center">
                                            * ข้อมูลรายเดือนคำนวณจากแผนงาน S-Curve
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
                        <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <Filter className="w-5 h-5 text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">เลือกโครงการ:</span>
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5 min-w-[250px]"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* DELAYED TASKS (Critical Actions) */}
                            <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden lg:col-span-1">
                                <div className="bg-red-50 p-4 border-b border-red-100 flex items-center justify-between">
                                    <h3 className="font-bold text-red-800 flex items-center gap-2">
                                        <AlertCircle className="w-5 h-5" />
                                        งานล่าช้า (Action Required)
                                    </h3>
                                    <span className="bg-red-200 text-red-800 text-xs font-bold px-2 py-1 rounded-full">
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
                                                        <span>(-{differenceInDays(new Date(), new Date(task.planEndDate))} วัน)</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* LOOKAHEAD TASKS */}
                            <div className="bg-white rounded-xl border border-blue-200 shadow-sm overflow-hidden lg:col-span-2">
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
