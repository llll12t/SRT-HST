'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import StandaloneSCurve from '@/components/charts/StandaloneSCurve';
import { TrendingUp, Loader2, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks } from '@/lib/firestore';
import { differenceInDays, parseISO } from 'date-fns';

const formatDateTH = (dateStr: string | Date | undefined | null) => {
    if (!dateStr) return '-';
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    if (isNaN(date.getTime())) return '-';
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const yearBE = (date.getFullYear() + 543).toString().slice(-2);
    return `${day}/${month}/${yearBE}`;
};

export default function SCurvePage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

    // Define fetch functions FIRST (useCallback)
    const fetchProjects = useCallback(async () => {
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
    }, [projectParam]);

    const fetchTasks = useCallback(async () => {
        try {
            if (!selectedProjectId) return;
            const tasksData = await getTasks(selectedProjectId);
            setTasks(tasksData);
        } catch (error) {
            console.error('Error fetching tasks:', error);
        }
    }, [selectedProjectId]);

    // THEN use them in useEffect
    useEffect(() => {
        fetchProjects();
    }, [fetchProjects]);

    useEffect(() => {
        if (projectParam && projects.length > 0) {
            setSelectedProjectId(projectParam);
        }
    }, [projectParam, projects]);

    useEffect(() => {
        if (selectedProjectId) {
            fetchTasks();
        }
    }, [selectedProjectId, fetchTasks]);

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    // Calculate stats
    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        inProgress: tasks.filter(t => t.status === 'in-progress').length,
        notStarted: tasks.filter(t => t.status === 'not-started').length
    };

    // Calculate overall progress based on Duration
    const totalDuration = tasks.reduce((sum, t) => {
        const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
        return sum + Math.max(0, d);
    }, 0);

    const weightedProgress = tasks.reduce((sum, t) => {
        const d = differenceInDays(parseISO(t.planEndDate), parseISO(t.planStartDate)) + 1;
        const duration = Math.max(0, d);
        return sum + (duration * (Number(t.progress) || 0) / 100);
    }, 0);
    const overallProgress = totalDuration > 0 ? (weightedProgress / totalDuration) * 100 : 0;

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
                        <TrendingUp className="w-6 h-6 text-blue-600" />
                        S-Curve
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">ติดตามความก้าวหน้าโครงการเทียบแผนงาน</p>
                </div>

                <div className="bg-white rounded border border-gray-300 p-12 text-center shadow-none">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4 text-sm">ไม่พบโครงการ กรุณาสร้างโครงการก่อน</p>
                    <Link
                        href="/projects"
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 inline-block transition-colors"
                    >
                        ไปหน้าโครงการ
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-sans">
            {/* Header with Inline Stats */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
                {/* Left: Title */}
                <div className="flex items-center gap-4">
                    <div>
                        <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-gray-600" />
                            S-Curve
                        </h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-medium">ติดตามความก้าวหน้าโครงการเทียบแผนงาน</p>
                    </div>

                    {/* Inline Stats - Compact */}
                    <div className="hidden md:flex items-center gap-1 ml-4">
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Project</span>
                            <span className="text-xs font-bold text-gray-900 max-w-[100px] truncate">{selectedProject?.name}</span>
                        </div>
                        {/* Project Date Range */}
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-200 rounded-sm">
                            <span className="text-[10px] text-blue-600 font-bold uppercase">Period</span>
                            <span className="text-xs font-bold text-blue-800 font-mono">
                                {formatDateTH(selectedProject?.startDate)}
                                {' - '}
                                {formatDateTH(selectedProject?.endDate)}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Progress</span>
                            <span className="text-xs font-bold text-blue-600 font-mono">{overallProgress.toFixed(1)}%</span>
                            <div className="w-12 h-1 bg-gray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${overallProgress}%` }} />
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Completed</span>
                            <span className="text-xs font-bold text-green-600 font-mono">{stats.completed}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">In Progress</span>
                            <span className="text-xs font-bold text-amber-600 font-mono">{stats.inProgress}</span>
                        </div>
                        <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-50 border border-gray-200 rounded-sm">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">Not Started</span>
                            <span className="text-xs font-bold text-gray-400 font-mono">{stats.notStarted}</span>
                        </div>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    <select
                        value={selectedProjectId}
                        onChange={(e) => setSelectedProjectId(e.target.value)}
                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                    >
                        {projects.map(p => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>

                    <Link
                        href={`/projects/${selectedProjectId}`}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                    >
                        View Details →
                    </Link>
                </div>
            </div>

            {/* S-Curve Chart */}
            {selectedProject && (
                <StandaloneSCurve
                    tasks={tasks}
                    startDate={selectedProject.startDate}
                    endDate={selectedProject.endDate}
                    title={selectedProject.name}
                />
            )}
        </div>
    );
}
