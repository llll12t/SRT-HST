'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { endOfWeek, startOfWeek, subWeeks, addWeeks, format } from 'date-fns';
import { CalendarDays, FileSpreadsheet, Loader2 } from 'lucide-react';
import { getAllTasks, getProjects } from '@/lib/firestore';
import { Project, Task } from '@/types/construction';
import Procurement4WeekGanttTable from '@/features/procurement/presentation/components/Procurement4WeekGanttTable';

export default function ProcurementOverviewPage() {
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);

    const fourWeekRange = useMemo(() => {
        const today = new Date();
        const start = startOfWeek(subWeeks(today, 1), { weekStartsOn: 1 });
        const end = endOfWeek(addWeeks(today, 2), { weekStartsOn: 1 });
        return {
            start,
            end,
            startDate: format(start, 'yyyy-MM-dd'),
            endDate: format(end, 'yyyy-MM-dd')
        };
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const [projectsData, tasksData] = await Promise.all([
                    getProjects(),
                    getAllTasks()
                ]);
                setProjects(projectsData);
                setTasks(tasksData);
            } catch (error) {
                console.error('Error loading procurement overview:', error);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูลจัดซื้อ...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-sans w-full min-w-0 max-w-full overflow-x-hidden">
            <div className="min-w-0 gantt-page-header flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <CalendarDays className="w-6 h-6 text-amber-600" />
                        แผนจัดซื้อ (ทุกโครงการ - 4 สัปดาห์)
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">
                        {format(fourWeekRange.start, 'dd/MM/yyyy')} - {format(fourWeekRange.end, 'dd/MM/yyyy')}
                    </p>
                </div>
                <Link
                    href="/procurement/orders"
                    className="h-9 px-3 rounded border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 text-sm font-semibold inline-flex items-center gap-2"
                >
                    <FileSpreadsheet className="w-4 h-4" />
                    รายงานสั่งซื้อ
                </Link>
            </div>

            <Procurement4WeekGanttTable
                projects={projects}
                tasks={tasks}
                windowStart={fourWeekRange.start}
                windowEnd={fourWeekRange.end}
                onProjectUpdate={(updatedProject) => {
                    setProjects(prev => prev.map(p => p.id === updatedProject.id ? updatedProject : p));
                }}
            />
        </div>
    );
}
