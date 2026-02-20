'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CalendarClock, Loader2 } from 'lucide-react';
import { getAllTasks, getProjects } from '@/lib/firestore';
import { Project, Task } from '@/types/construction';
import ProcurementOrderReport from '@/features/procurement/presentation/components/ProcurementOrderReport';

export default function ProcurementOrdersPage() {
    const [loading, setLoading] = useState(true);
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);

    const todayLabel = useMemo(() => format(new Date(), 'dd/MM/yyyy'), []);

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
                console.error('Error loading procurement order report:', error);
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
                <span className="ml-2 text-gray-500">Loading procurement order report...</span>
            </div>
        );
    }

    return (
        <div className="space-y-4 font-sans w-full min-w-0 max-w-full">
            <div className="gantt-page-header">
                <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                    <CalendarClock className="w-6 h-6 text-orange-600" />
                    Procurement Order Report
                </h1>
                <p className="text-gray-500 text-sm mt-0.5">
                    Action list for materials and procurement preparation as of {todayLabel}
                </p>
            </div>

            <ProcurementOrderReport
                projects={projects}
                tasks={tasks}
            />
        </div>
    );
}
