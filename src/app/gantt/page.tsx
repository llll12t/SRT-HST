'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import GanttChart from '@/components/charts/GanttChart';
import { Download, Calendar, Loader2, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks } from '@/lib/firestore';
import { format, differenceInDays, parseISO } from 'date-fns';

export default function GanttPage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    useEffect(() => {
        fetchProjects();
    }, []);

    useEffect(() => {
        if (projectParam && projects.length > 0) {
            setSelectedProjectId(projectParam);
        }
    }, [projectParam, projects]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId]);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);

            if (projectsData.length > 0 && !projectParam) {
                setSelectedProjectId(projectsData[0].id);
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTasks = async () => {
        try {
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    const handleExport = () => {
        if (tasks.length === 0) return;

        const headers = ['Category', 'Task Name', 'Start Date', 'End Date', 'Duration (Days)', 'Weight (%)', 'Progress (%)'];
        const rows = tasks.map(task => {
            let duration = 0;
            try {
                duration = differenceInDays(parseISO(task.planEndDate), parseISO(task.planStartDate)) + 1;
            } catch (e) {
                duration = 0;
            }
            return [
                `"${task.category}"`,
                `"${task.name}"`,
                task.planStartDate,
                task.planEndDate,
                duration,
                task.weight || 0,
                task.progress || 0
            ].join(',');
        });

        // Add BOM for Thai characters in Excel
        const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `gantt_export_${selectedProject?.name || 'project'}_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    // Calculate stats
    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        notStarted: tasks.filter(t => t.status === 'not-started').length
    };

    // Calculate overall progress
    const totalWeight = tasks.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
    const weightedProgress = tasks.reduce((sum, t) =>
        sum + ((Number(t.weight) || 0) * (Number(t.progress) || 0) / 100), 0
    );
    const overallProgress = totalWeight > 0 ? (weightedProgress / totalWeight) * 100 : 0;

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    if (projects.length === 0) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Gantt Chart
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">แผนงานและกำหนดการโครงการ</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">ไม่พบโครงการ กรุณาสร้างโครงการก่อน</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 inline-block"
                    >
                        ไปหน้าโครงการ
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Calendar className="w-6 h-6 text-blue-600" />
                        Gantt Chart
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">แผนงานและกำหนดการโครงการ</p>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500 transition-colors"
                    >
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    <button
                        onClick={handleExport}
                        disabled={tasks.length === 0}
                        className={`px-4 py-2 text-sm font-medium border rounded-lg flex items-center gap-2 transition-colors ${tasks.length === 0
                                ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                : 'text-gray-700 bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">โครงการ</p>
                    <p className="text-base font-semibold text-gray-900 mt-1 truncate">{selectedProject?.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{selectedProject?.owner}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">ความคืบหน้า</p>
                    <p className="text-xl font-semibold text-blue-600 mt-1">{overallProgress.toFixed(1)}%</p>
                    <div className="h-1 bg-gray-100 rounded-full mt-2 overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${overallProgress}%` }}
                        />
                    </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">เสร็จสิ้น</p>
                    <p className="text-xl font-semibold text-green-600 mt-1">{stats.completed}</p>
                    <p className="text-xs text-gray-400">จาก {stats.total} งาน</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">กำลังดำเนินการ</p>
                    <p className="text-xl font-semibold text-amber-600 mt-1">{stats.inProgress}</p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">ยังไม่เริ่ม</p>
                    <p className="text-xl font-semibold text-gray-500 mt-1">{stats.notStarted}</p>
                </div>
            </div>

            {/* Gantt Chart */}
            {selectedProject && (
                <GanttChart
                    tasks={tasks}
                    startDate={selectedProject.startDate}
                    endDate={selectedProject.endDate}
                    title={selectedProject.name}
                />
            )}

            {/* Quick Actions */}
            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
                <div className="text-sm text-gray-500">
                    {tasks.length > 0 ? (
                        <span>
                            แสดง {tasks.length} งาน |
                            ช่วงเวลา: {selectedProject?.startDate} → {selectedProject?.endDate}
                        </span>
                    ) : (
                        <span>ไม่มีงานในโครงการนี้</span>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <Link
                        href={`/projects/${selectedProjectId}`}
                        className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    >
                        ดูรายละเอียด →
                    </Link>
                </div>
            </div>
        </div>
    );
}
