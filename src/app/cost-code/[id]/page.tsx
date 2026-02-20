'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Loader2,
    AlertTriangle,
    Target,
    Download,
    Printer,
    Layout,
    ChevronDown,
    Layers,
    Calendar,
    TrendingUp
} from 'lucide-react';
import { Project, Task } from '@/types/construction';
import { getProject, getTasks } from '@/lib/firestore';
import { COST_CODES, getCostCodeName } from '@/constants/costCodes';

export default function CostCodeSummaryPage() {
    const params = useParams();
    const router = useRouter();
    const projectId = params.id as string;

    const [project, setProject] = useState<Project | null>(null);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    // Menu States
    const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
    const viewMenuRef = useRef<HTMLDivElement>(null);

    // Fetch Data
    useEffect(() => {
        if (projectId) {
            fetchData();
        }
    }, [projectId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (viewMenuRef.current && !viewMenuRef.current.contains(event.target as Node)) {
                setIsViewMenuOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [projectData, tasksData] = await Promise.all([
                getProject(projectId),
                getTasks(projectId)
            ]);
            setProject(projectData);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate Cost Code Stats
    const costCodeStats = useMemo(() => {
        const stats: Record<string, { name: string; total: number; count: number }> = {};

        // Initialize with all known codes
        COST_CODES.forEach(code => {
            stats[code.id] = { name: code.name, total: 0, count: 0 };
        });

        tasks.forEach(task => {
            if (task.costCode) {
                if (!stats[task.costCode]) {
                    // Fallback for codes not in the constant list
                    stats[task.costCode] = { name: getCostCodeName(task.costCode) || 'Unknown', total: 0, count: 0 };
                }
                stats[task.costCode].total += task.cost || 0;
                stats[task.costCode].count += 1;
            } else {
                if (!stats['uncategorized']) {
                    stats['uncategorized'] = { name: 'ไม่ระบุ Cost Code', total: 0, count: 0 };
                }
                stats['uncategorized'].total += task.cost || 0;
                stats['uncategorized'].count += 1;
            }
        });

        return Object.entries(stats)
            .filter(([_, data]) => data.total > 0 || data.count > 0)
            .sort((a, b) => {
                if (a[0] === 'uncategorized') return 1;
                if (b[0] === 'uncategorized') return -1;
                return a[0].localeCompare(b[0], undefined, { numeric: true });
            });
    }, [tasks]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-sm text-gray-500">Loading data...</span>
            </div>
        );
    }

    if (!project) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen text-center p-4">
                <AlertTriangle className="w-10 h-10 text-amber-500 mb-2" />
                <h1 className="text-lg font-medium text-gray-900 mb-1">Project Not Found</h1>
                <Link href="/projects" className="text-sm text-blue-600 hover:underline">Back to Projects</Link>
            </div>
        );
    }

    const totalCount = costCodeStats.reduce((acc, [_, s]) => acc + s.count, 0);
    const totalCost = costCodeStats.reduce((acc, [_, s]) => acc + s.total, 0);

    const handleExportCSV = () => {
        if (!costCodeStats.length) return;

        const headers = ['Cost Code', 'Description', 'Count', 'Total Cost'];
        const rows = costCodeStats.map(([id, stat]) => [
            id === 'uncategorized' ? 'ไม่ระบุ' : id,
            stat.name,
            stat.count,
            stat.total
        ]);

        let csvContent = "\uFEFF" + headers.join(",") + "\n" + rows.map(r => r.join(",")).join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `cost_code_summary_${project?.name || 'project'}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPDF = () => {
        const style = document.createElement('style');
        style.innerHTML = `
            @media print {
                @page { size: A4 portrait; margin: 15mm; }
                body * { visibility: hidden; }
                #printable-content, #printable-content * { visibility: visible; }
                #printable-content { position: absolute; left: 0; top: 0; width: 100%; }
                .no-print { display: none !important; }
                table { width: 100%; border-collapse: collapse; font-size: 10pt; }
                th, td { border: 1px solid #333; padding: 4px 8px; }
                th { background-color: #f0f0f0; }
                h1 { font-size: 14pt; margin-bottom: 5px; }
                p { font-size: 10pt; margin-bottom: 15px; }
            }
        `;
        document.head.appendChild(style);
        window.print();
        setTimeout(() => document.head.removeChild(style), 1000);
    };

    return (
        <div className="min-h-screen bg-white text-gray-900 font-sans" id="printable-content">
            <div className="max-w-7xl mx-auto px-4 py-4 space-y-4">
                {/* Header */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-gray-200 pb-4">
                    <div className="flex items-start gap-3">
                        <Link
                            href={`/projects/${projectId}`}
                            className="p-1.5 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors no-print"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div>
                            <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
                                <Target className="w-5 h-5 text-gray-700" />
                                Cost Code Summary
                            </h1>
                            <p className="text-sm text-gray-500">{project.name} {project.code ? `(${project.code})` : ''}</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 no-print">
                        {/* Views Dropdown */}
                        <div className="relative" ref={viewMenuRef}>
                            <button
                                onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                                className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                            >
                                <Layout className="w-4 h-4 text-gray-500" />
                                Views
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                            </button>

                            {isViewMenuOpen && (
                                <div className="absolute right-0 mt-1 w-48 bg-white border border-gray-200 rounded shadow-lg z-[110] py-1">
                                    <Link
                                        href={`/projects/${projectId}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <ArrowLeft className="w-4 h-4 text-gray-500" />
                                        Back to Details
                                    </Link>
                                    <div className="h-px bg-gray-100 my-1" />
                                    <Link
                                        href={`/gantt/${projectId}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Layers className="w-4 h-4 text-blue-600" />
                                        Gantt Chart
                                    </Link>
                                    {/* Current Page Link (Disabled or Highlighted) */}
                                    <div className="px-3 py-2 text-sm bg-purple-50 text-purple-700 flex items-center gap-2 font-medium cursor-default">
                                        <Target className="w-4 h-4" />
                                        Cost Code Summary
                                    </div>
                                    <Link
                                        href={`/gantt-4w/${projectId}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Calendar className="w-4 h-4 text-indigo-600" />
                                        4-Week Lookahead
                                    </Link>
                                    <Link
                                        href={`/procurement/${projectId}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <Calendar className="w-4 h-4 text-amber-600" />
                                        Procurement Plan
                                    </Link>
                                    <Link
                                        href={`/scurve/${projectId}`}
                                        className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                        onClick={() => setIsViewMenuOpen(false)}
                                    >
                                        <TrendingUp className="w-4 h-4 text-emerald-600" />
                                        S-Curve Analysis
                                    </Link>
                                </div>
                            )}
                        </div>

                        <div className="h-4 w-px bg-gray-300 mx-1"></div>

                        <button
                            onClick={handleExportCSV}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-xs font-medium flex items-center gap-2"
                        >
                            <Download className="w-3.5 h-3.5" />
                            CSV
                        </button>
                        <button
                            onClick={handleExportPDF}
                            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 text-xs font-medium flex items-center gap-2"
                        >
                            <Printer className="w-3.5 h-3.5" />
                            Print
                        </button>
                    </div>
                </div>

                {/* Content Table */}
                <div className="border border-gray-200 rounded overflow-hidden">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead className="bg-gray-100 text-gray-700 uppercase leading-normal text-xs font-semibold">
                            <tr>
                                <th className="px-4 py-3 border-b border-gray-200 w-32">Code</th>
                                <th className="px-4 py-3 border-b border-gray-200">Description</th>
                                <th className="px-4 py-3 border-b border-gray-200 text-center w-24">Count</th>
                                <th className="px-4 py-3 border-b border-gray-200 text-right w-40">Total Cost (THB)</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-700">
                            {costCodeStats.length > 0 ? (
                                costCodeStats.map(([id, stat]) => (
                                    <tr key={id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-2 font-medium text-gray-900 tabular-nums">
                                            {id === 'uncategorized' ? '-' : id}
                                        </td>
                                        <td className="px-4 py-2">
                                            {stat.name}
                                        </td>
                                        <td className="px-4 py-2 text-center tabular-nums text-gray-600">
                                            {stat.count}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-gray-900 tabular-nums">
                                            {stat.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-8 text-center text-gray-500 italic">
                                        No cost data available.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                        <tfoot className="bg-gray-50 font-bold text-gray-900 border-t border-gray-200">
                            <tr>
                                <td colSpan={2} className="px-4 py-3 text-right">Grand Total</td>
                                <td className="px-4 py-3 text-center tabular-nums">{totalCount}</td>
                                <td className="px-4 py-3 text-right text-black tabular-nums">
                                    {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        </div>
    );
}
