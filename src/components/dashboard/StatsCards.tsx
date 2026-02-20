'use client';

import React from 'react';
import { Task, WeeklyLog } from '@/types/construction';
import { TrendingUp, TrendingDown, Clock, CheckCircle2, AlertTriangle, Target } from 'lucide-react';

interface StatsCardsProps {
    tasks: Task[];
    weeklyLogs: WeeklyLog[];
    currentProgress: number;
}

interface StatCardProps {
    title: string;
    value: string | number;
    subtitle?: string;
    icon: React.ReactNode;
    iconBg: string;
    trend?: { value: string; isPositive: boolean };
}

function StatCard({ title, value, subtitle, icon, iconBg, trend }: StatCardProps) {
    return (
        <div className=" rounded-md border border-gray-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-gray-500 text-xs font-medium">{title}</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
                    {subtitle && (
                        <p className="text-gray-400 text-xs mt-1">{subtitle}</p>
                    )}
                    {trend && (
                        <div className={`flex items-center gap-1 mt-2 ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {trend.isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            <span className="text-xs font-medium">{trend.value}</span>
                        </div>
                    )}
                </div>
                <div className={`p-2.5 rounded-md ${iconBg}`}>
                    {icon}
                </div>
            </div>
        </div>
    );
}

export default function StatsCards({ tasks, weeklyLogs, currentProgress }: StatsCardsProps) {
    const totalTasks = tasks.length;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress').length;
    const notStartedTasks = tasks.filter(t => t.status === 'not-started').length;

    const latestLog = weeklyLogs[weeklyLogs.length - 1];
    const variance = latestLog
        ? (latestLog.plannedCumulativeProgress - latestLog.actualCumulativeProgress).toFixed(2)
        : '0';

    const lastWeekProgress = weeklyLogs.length >= 2
        ? weeklyLogs[weeklyLogs.length - 1].actualCumulativeProgress -
        weeklyLogs[weeklyLogs.length - 2].actualCumulativeProgress
        : 0;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
                title="ความคืบหน้ารวม"
                value={`${currentProgress}%`}
                subtitle="Overall Progress"
                icon={<Target className="w-5 h-5 text-blue-600" />}
                iconBg="bg-blue-50"
                trend={{ value: `+${lastWeekProgress.toFixed(2)}% สัปดาห์นี้`, isPositive: lastWeekProgress >= 0 }}
            />

            <StatCard
                title="งานที่เสร็จสิ้น"
                value={`${completedTasks}/${totalTasks}`}
                subtitle={`${((completedTasks / totalTasks) * 100).toFixed(0)}% ของงานทั้งหมด`}
                icon={<CheckCircle2 className="w-5 h-5 text-green-600" />}
                iconBg="bg-green-50"
            />

            <StatCard
                title="กำลังดำเนินการ"
                value={inProgressTasks}
                subtitle={`${notStartedTasks} งานยังไม่เริ่ม`}
                icon={<Clock className="w-5 h-5 text-amber-600" />}
                iconBg="bg-amber-50"
            />

            <StatCard
                title="ส่วนต่าง Plan-Actual"
                value={`${variance}%`}
                subtitle={parseFloat(variance) > 0 ? 'ล่าช้ากว่าแผน' : 'เร็วกว่าแผน'}
                icon={parseFloat(variance) > 5 ? <AlertTriangle className="w-5 h-5 text-red-600" /> : <TrendingUp className="w-5 h-5 text-green-600" />}
                iconBg={parseFloat(variance) > 5 ? "bg-red-50" : "bg-green-50"}
                trend={{ value: parseFloat(variance) > 5 ? 'ต้องเร่งงาน' : 'อยู่ในเกณฑ์ดี', isPositive: parseFloat(variance) <= 5 }}
            />
        </div>
    );
}
