'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import SCurveChart from '@/components/charts/scurve/SCurveChart';
import { Calendar, Loader2, FolderKanban, TrendingUp, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import { Employee, Project, Task } from '@/types/construction';
import { getEmployees, getProjects, getTasks } from '@/lib/firestore';
import { format, isBefore } from 'date-fns';
import { parseDate } from '@/components/charts/gantt/utils';

export default function SCurvePage() {
    const searchParams = useSearchParams();
    const projectParam = searchParams.get('project') || searchParams.get('projectId');

    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('');

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

    useEffect(() => {
        const fetchEmployeesData = async () => {
            try {
                const employeesData = await getEmployees();
                setEmployees(employeesData);
            } catch (error) {
                console.error('Error fetching employees:', error);
            }
        };
        fetchEmployeesData();
    }, []);

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
                        <TrendingUp className="w-6 h-6 text-emerald-600" />
                        S-Curve วิเคราะห์และวางแผน
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">วิเคราะห์ความคืบหน้าและแนวโน้มโครงการแบบ S-Curve</p>
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
            {selectedProject && (
                <div className="gantt-page-header flex items-start justify-between gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                            <TrendingUp className="w-6 h-6 text-emerald-600" />
                            S-Curve วิเคราะห์และวางแผน
                        </h1>
                        <p className="text-gray-500 text-sm mt-0.5">วิเคราะห์แผนงานและผลจริงของโครงการ</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap justify-end">
                        <Link
                            href={`/gantt?project=${selectedProjectId}`}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                        >
                            <BarChart3 className="w-4 h-4" />
                            ไปหน้า Gantt
                        </Link>

                        {!projectParam && (
                            <select
                                value={selectedProjectId}
                                onChange={(e) => setSelectedProjectId(e.target.value)}
                                className="px-3 py-2 bg-white border border-gray-300 rounded text-sm text-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-colors"
                            >
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        )}

                        <Link
                            href={`/projects/${selectedProjectId}`}
                            className="px-4 py-2 text-sm font-medium text-blue-600 bg-white border border-blue-200 rounded hover:bg-blue-50 transition-colors"
                        >
                            View Details →
                        </Link>
                    </div>
                </div>
            )}

            {selectedProject && (() => {
                const minTaskStart = tasks.reduce((min, t) => {
                    if (!t.planStartDate) return min;
                    const d = parseDate(t.planStartDate);
                    if (isNaN(d.getTime())) return min;
                    return !min || isBefore(d, min) ? d : min;
                }, null as Date | null);

                const chartStart = minTaskStart
                    ? format(minTaskStart, 'dd/MM/yyyy')
                    : selectedProject.startDate;

                return (
                    <SCurveChart
                        tasks={tasks}
                        employees={employees}
                        startDate={chartStart}
                        endDate={selectedProject.endDate}
                        title={selectedProject.name}
                        onTaskUpdate={async (taskId, field, value) => {
                            setTasks(prev => prev.map(t =>
                                t.id === taskId ? { ...t, [field]: value } : t
                            ));
                            // TODO: persist to Firestore in next phase
                        }}
                    />
                );
            })()}
        </div>
    );
}
