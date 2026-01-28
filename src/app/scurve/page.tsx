'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import SCurveChart from '@/components/charts/scurve/SCurveChart';
import { Download, Calendar, Loader2, FolderKanban, TrendingUp, X, Save } from 'lucide-react';
import Link from 'next/link';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks } from '@/lib/firestore';
import { format, differenceInDays, parseISO, addDays, isBefore } from 'date-fns';
import { parseDate } from '@/components/charts/gantt/utils';

export default function SCurvePage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project') || searchParams.get('projectId');

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
                        S-Curve Analysis
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">วิเคราะห์ความคืบหน้าโครงการแบบ S-Curve</p>
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
                            S-Curve Analysis
                        </h1>
                        <p className="text-gray-500 text-xs mt-0.5 font-medium">วิเคราะห์แผนงานและผลงานจริง</p>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                    {!projectParam && (
                        <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                        >
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                    )}

                    <Link
                        href={`/projects/${selectedProjectId}`}
                        className="px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-1.5 hover:bg-blue-100 transition-colors"
                    >
                        View Details →
                    </Link>
                </div>
            </div>

            {/* S-Curve Chart */}
            {selectedProject && (() => {
                // Calculate min start from tasks to align S-Curve with work
                const minTaskStart = tasks.reduce((min, t) => {
                    if (!t.planStartDate) return min;
                    const d = parseDate(t.planStartDate);
                    if (isNaN(d.getTime())) return min;
                    return !min || isBefore(d, min) ? d : min;
                }, null as Date | null);

                // If tasks exist, use earliest task start, otherwise project start
                const chartStart = minTaskStart
                    ? format(minTaskStart, 'dd/MM/yyyy')
                    : selectedProject.startDate;

                return (
                    <SCurveChart
                        tasks={tasks}
                        startDate={chartStart}
                        endDate={selectedProject.endDate}
                        title={selectedProject.name}
                        onTaskUpdate={async (taskId, field, value) => {
                            // Optimistic Update
                            setTasks(prev => prev.map(t =>
                                t.id === taskId ? { ...t, [field]: value } : t
                            ));
                            // TODO: Call API to save to Firestore
                            // await updateTask(taskId, { [field]: value });
                        }}
                    />
                );
            })()}
        </div>
    );
}
