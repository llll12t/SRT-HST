'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FolderGit2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  CheckCircle2,
  Clock,
  ArrowRight,
  MoreHorizontal,
  CalendarDays,
  BarChart3,
  GanttChartSquare,
  Building2
} from 'lucide-react';
import { format, parseISO, differenceInDays, isAfter, isBefore, isWithinInterval, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { Project, Task } from '@/types/construction';
import { getProjects, getAllTasks } from '@/lib/firestore';

// Helper to reliably parse any date value
const parseDate = (val: any): Date => {
  if (!val) return new Date();
  if (val instanceof Date) return val;
  if (typeof val?.toDate === 'function') return val.toDate();
  if (typeof val === 'string') return parseISO(val);
  return new Date();
};

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [projectsData, tasksData] = await Promise.all([
          getProjects(),
          getAllTasks()
        ]);
        setProjects(projectsData);
        setTasks(tasksData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // --- Calculation Logic ---

  // Calculate Planned Progress % for a specific project AT TODAY
  const calculatePlannedProgress = (projectId: string, projectStart: string, projectEnd: string): number => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;

    const now = new Date();
    // Use cost weighting if available, else duration
    const useCostWeighting = projectTasks.some(t => (t.cost || 0) > 0);

    let totalWeight = 0;
    let plannedEarnedValue = 0;

    projectTasks.forEach(task => {
      const start = parseDate(task.planStartDate);
      const end = parseDate(task.planEndDate);
      const duration = differenceInDays(end, start) + 1;

      if (duration <= 0) return;

      let weight = 0;
      if (useCostWeighting) {
        weight = task.cost || 0;
      } else {
        weight = duration;
      }
      totalWeight += weight;

      // Calculate overlap with "Now"
      // If task finished before now -> 100% of weight
      // If task hasn't started -> 0%
      // If in progress -> partial weight

      if (isBefore(end, now)) {
        plannedEarnedValue += weight;
      } else if (isAfter(start, now)) {
        // Not started yet
        plannedEarnedValue += 0;
      } else {
        // In progress
        const daysToNow = differenceInDays(now, start) + 1;
        const progressRatio = Math.max(0, Math.min(1, daysToNow / duration));
        plannedEarnedValue += (weight * progressRatio);
      }
    });

    return totalWeight > 0 ? (plannedEarnedValue / totalWeight) * 100 : 0;
  };

  // Calculate Actual Progress % (Current status)
  const calculateActualProgress = (projectId: string): number => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;

    const useCostWeighting = projectTasks.some(t => (t.cost || 0) > 0);
    let totalWeight = 0;
    let earnedValue = 0;

    if (useCostWeighting) {
      totalWeight = projectTasks.reduce((sum, t) => sum + (t.cost || 0), 0);
      earnedValue = projectTasks.reduce((sum, t) => sum + ((t.cost || 0) * (t.progress || 0) / 100), 0);
    } else {
      totalWeight = projectTasks.reduce((sum, t) => {
        const start = parseDate(t.planStartDate);
        const end = parseDate(t.planEndDate);
        const duration = differenceInDays(end, start) + 1;
        return sum + Math.max(0, duration);
      }, 0);

      earnedValue = projectTasks.reduce((sum, t) => {
        const start = parseDate(t.planStartDate);
        const end = parseDate(t.planEndDate);
        const duration = differenceInDays(end, start) + 1;
        const weight = Math.max(0, duration);
        return sum + (weight * (t.progress || 0) / 100);
      }, 0);
    }

    return totalWeight > 0 ? (earnedValue / totalWeight) * 100 : 0;
  };

  // Process Projects Data
  const processedProjects = projects.map(project => {
    const planned = calculatePlannedProgress(project.id, project.startDate, project.endDate);
    const actual = calculateActualProgress(project.id);
    const variance = actual - planned;
    const status = variance < -5 ? 'delayed' : variance > 5 ? 'ahead' : 'on-track';

    // Count tasks
    const pTasks = tasks.filter(t => t.projectId === project.id);
    const completedTasks = pTasks.filter(t => t.status === 'completed').length;

    return {
      ...project,
      stats: {
        planned,
        actual,
        variance,
        status,
        totalTasks: pTasks.length,
        completedTasks
      }
    };
  });

  // Global Stats
  const globalStats = {
    total: projects.length,
    delayed: processedProjects.filter(p => p.stats.status === 'delayed').length,
    onTrack: processedProjects.filter(p => p.stats.status === 'on-track').length,
    completed: projects.filter(p => p.status === 'completed').length
  };

  // Identify Critical Tasks (Across all projects)
  // Tasks that should be started/done but are behind
  const today = new Date();
  const criticalTasks = tasks
    .filter(t => t.progress < 100)
    .map(t => {
      const planEnd = parseDate(t.planEndDate);
      const planStart = parseDate(t.planStartDate);

      // Calculate delay logic
      let isDelayed = false;
      let delayLabel = '';

      if (isBefore(planEnd, today)) {
        isDelayed = true;
        delayLabel = 'เลยกำหนดส่ง';
      } else if (isBefore(planStart, today) && t.progress === 0) {
        isDelayed = true;
        delayLabel = 'ยังไม่เริ่มตามแผน';
      }

      return { ...t, isDelayed, delayLabel, planEnd };
    })
    .filter(t => t.isDelayed)
    .sort((a, b) => a.planEnd.getTime() - b.planEnd.getTime()) // Most overdue first
    .slice(0, 5);


  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  // Default to 'active' to show only relevant projects initially
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'planning' | 'in-progress' | 'completed' | 'on-hold'>('active');

  // Filter Projects
  const filteredProjects = processedProjects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'active') {
      // Active = Planning + In Progress
      matchesStatus = ['planning', 'in-progress'].includes(project.status);
    } else {
      matchesStatus = project.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
        <p className="text-gray-600">กำลังประมวลผลข้อมูลโครงการ...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-10">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ภาพรวมโครงการ (Portfolio Dashboard)</h1>
          <p className="text-gray-600 text-sm mt-1">
            สถานะความคืบหน้าของทุกโครงการ ณ วันที่ {format(new Date(), 'd MMMM yyyy', { locale: th })}
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-sm text-sm font-medium hover:bg-blue-700 transition-colors shadow-none"
        >
          <FolderGit2 className="w-4 h-4 mr-2" />
          จัดการโครงการ
        </Link>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div
          className={`cursor-pointer p-5 rounded-sm border shadow-none flex items-center justify-between transition-all
            bg-white border-gray-300 hover:border-blue-500`}
        >
          <div>
            <p className="text-sm font-medium text-gray-600">โครงการทั้งหมด</p>
            <p className="text-3xl font-bold text-gray-900 mt-1">{globalStats.total}</p>
          </div>
          <div className="w-10 h-10 bg-gray-100 rounded-sm flex items-center justify-center text-gray-600">
            <FolderGit2 className="w-6 h-6" />
          </div>
        </div>

        <div
          className="bg-white p-5 rounded-sm border border-gray-300 shadow-none flex items-center justify-between cursor-default"
        >
          <div>
            <p className="text-sm font-medium text-gray-600">กำลังดำเนินการ (ตามแผน)</p>
            <p className="text-3xl font-bold text-green-600 mt-1">{globalStats.onTrack}</p>
          </div>
          <div className="w-10 h-10 bg-green-50 rounded-sm flex items-center justify-center text-green-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div
          className="bg-white p-5 rounded-sm border border-gray-300 shadow-none flex items-center justify-between cursor-default"
        >
          <div>
            <p className="text-sm font-medium text-gray-600">ล่าช้ากว่ากำหนด</p>
            <p className="text-3xl font-bold text-red-600 mt-1">{globalStats.delayed}</p>
          </div>
          <div className="w-10 h-10 bg-red-50 rounded-sm flex items-center justify-center text-red-600">
            <AlertCircle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-sm border border-gray-300 shadow-none flex items-center justify-between cursor-default">
          <div>
            <p className="text-sm font-medium text-gray-600">งานวิกฤต (Critical)</p>
            <p className="text-3xl font-bold text-amber-600 mt-1">{criticalTasks.length}</p>
          </div>
          <div className="w-10 h-10 bg-amber-50 rounded-sm flex items-center justify-center text-amber-600">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Main Content: Project List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-600" />
              สถานะรายโครงการ
            </h2>

            {/* Search & Filter - Matches Projects Page */}
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-4 w-4 text-gray-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                </div>
                <input
                  type="text"
                  placeholder="ค้นหาโครงการ..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-64 pl-9 pr-4 py-1.5 bg-white border border-gray-300 rounded-sm text-sm focus:border-black transition-colors"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-1.5 bg-white border border-gray-300 rounded-sm text-sm focus:border-black transition-colors font-medium text-gray-700"
              >
                <option value="active">⚡ ดำเนินการอยู่ (Active)</option>
                <option value="all">ทั้งหมด (All)</option>
                <option disabled>──────────</option>
                <option value="planning">วางแผน</option>
                <option value="in-progress">กำลังดำเนินการ</option>
                <option value="on-hold">ระงับชั่วคราว</option>
                <option value="completed">เสร็จสิ้น</option>
              </select>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="text-center py-10 bg-gray-50 rounded-sm border border-dashed border-gray-300">
              <p className="text-gray-600">ไม่พบโครงการในหมวดหมู่นี้</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredProjects.map(project => {
                const isCompleted = project.status === 'completed';
                const isOnHold = project.status === 'on-hold';

                return (
                  <div
                    key={project.id}
                    className={`
                      rounded-sm border border-gray-300 shadow-none hover:border-gray-400 transition-all p-4 relative overflow-hidden group
                      ${isCompleted ? 'bg-green-50/30 border-green-200' :
                        isOnHold ? 'bg-amber-50/30 border-amber-200 opacity-90' :
                          'bg-white border-gray-300'}
                    `}
                  >
                    {isCompleted && (
                      <div className="absolute right-0 top-0 w-16 h-16 overflow-hidden pointer-events-none">
                        <div className="absolute top-[8px] right-[-25px] w-[90px] h-[25px] bg-green-500/10 -rotate-45 transform" />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-3 relative z-10">
                      <div>
                        <div className="flex items-center gap-2 mb-0.5">
                          <h3 className={`font-bold text-base ${isCompleted ? 'text-green-900' : 'text-gray-900'}`}>
                            {project.name}
                          </h3>
                          {isCompleted && <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] rounded-sm border border-green-200 font-medium">เสร็จสิ้น</span>}
                          {isOnHold && <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-sm border border-amber-200 font-medium">ระงับชั่วคราว</span>}
                        </div>
                        <p className="text-xs text-gray-600 flex items-center gap-1.5">
                          <CalendarDays className="w-3 h-3" />
                          {format(parseDate(project.startDate), 'd MMM yy', { locale: th })} - {format(parseDate(project.endDate), 'd MMM yy', { locale: th })}
                        </p>
                      </div>

                      <div className={`px-2.5 py-1 rounded-sm text-xs font-medium flex items-center gap-1.5 self-start
                                      ${project.stats.status === 'delayed' && !isCompleted ? 'bg-red-50 text-red-700' :
                          project.stats.status === 'ahead' || isCompleted ? 'bg-green-50 text-green-700' :
                            'bg-blue-50 text-blue-700'}`}>
                        {project.stats.status === 'delayed' && !isCompleted ? <TrendingDown className="w-3.5 h-3.5" /> :
                          project.stats.status === 'ahead' || isCompleted ? <TrendingUp className="w-3.5 h-3.5" /> : <div className="w-3.5 h-3.5 bg-blue-500 rounded-sm scale-50" />}

                        {isCompleted ? 'เสร็จสมบูรณ์' :
                          isOnHold ? 'ระงับชั่วคราว' :
                            project.stats.status === 'delayed' ? 'ล่าช้า' :
                              project.stats.status === 'ahead' ? 'เร็วกว่าแผน' : 'ตรงตามแผน'}

                        {!isCompleted && !isOnHold && (
                          <span className="opacity-75 text-[10px] ml-0.5">
                            ({project.stats.variance > 0 ? '+' : ''}{project.stats.variance.toFixed(1)}%)
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bars - Compact */}
                    <div className="space-y-2 mb-3 relative z-10">
                      <div>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600">Plan (แผนงาน)</span>
                          <span className="font-semibold text-gray-800">
                            {isCompleted ? '100.00' : project.stats.planned.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-sm overflow-hidden">
                          <div
                            className={`h-full rounded-sm ${isCompleted ? 'bg-green-400' : 'bg-blue-400'}`}
                            style={{ width: `${isCompleted ? 100 : project.stats.planned}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-0.5">
                          <span className="text-gray-600">Actual (ผลงาน)</span>
                          <span className={`font-semibold ${project.stats.status === 'delayed' && !isCompleted ? 'text-red-600' : 'text-green-600'}`}>
                            {isCompleted ? '100.00' : project.stats.actual.toFixed(2)}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-gray-100 rounded-sm overflow-hidden">
                          <div
                            className={`h-full rounded-sm ${project.stats.status === 'delayed' && !isCompleted ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${isCompleted ? 100 : project.stats.actual}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Footer Actions - Compact */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-100 relative z-10">
                      <div className="text-xs text-gray-500">
                        {project.stats.completedTasks} / {project.stats.totalTasks} tasks
                      </div>
                      <div className="flex items-center gap-2">
                        <Link href={`/s-curve?project=${project.id}`} className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 transition-colors px-1.5 py-1 hover:bg-gray-50 rounded-sm">
                          <BarChart3 className="w-3.5 h-3.5" /> S-Curve
                        </Link>
                        <Link href={`/gantt?projectId=${project.id}`} className="text-xs text-gray-600 hover:text-blue-600 flex items-center gap-1 transition-colors px-1.5 py-1 hover:bg-gray-50 rounded-sm">
                          <GanttChartSquare className="w-3.5 h-3.5" /> Gantt
                        </Link>
                        <Link href={`/projects/${project.id}`} className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-0.5 transition-colors ml-1">
                          รายละเอียด <ArrowRight className="w-3.5 h-3.5" />
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar: Critical Tasks */}
        <div className="space-y-6">
          {/* Critical Tasks Card */}
          <div className="bg-white rounded-sm border border-gray-300 shadow-none p-5">
            <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-500" />
              งานที่ต้องเร่งแก้ไข
            </h3>

            {criticalTasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <CheckCircle2 className="w-10 h-10 text-green-100 mb-2" />
                <p className="text-sm text-gray-600">ยอดเยี่ยม! ไม่มีงานล่าช้า</p>
              </div>
            ) : (
              <div className="space-y-3">
                {criticalTasks.map(task => {
                  const project = projects.find(p => p.id === task.projectId);
                  return (
                    <div key={task.id} className="p-3 bg-red-50 rounded-sm border border-red-200">
                      <div className="flex items-start justify-between mb-1">
                        <span className="text-xs font-semibold text-red-600 px-1.5 py-0.5 bg-white rounded-sm border border-red-200">
                          {task.delayLabel}
                        </span>
                        <span className="text-xs text-red-500">{project?.name.substring(0, 15)}...</span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 line-clamp-2 mb-1">{task.name}</p>
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>กำหนดส่ง: {format(parseDate(task.planEndDate), 'd MMM')}</span>
                        <span>คืบหน้า: {task.progress}%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {criticalTasks.length > 0 && (
              <Link href="/tasks" className="block text-center text-sm text-gray-600 hover:text-gray-900 mt-4 pt-4 border-t border-gray-100">
                ดูงานทั้งหมด
              </Link>
            )}
          </div>

          {/* Weather / Info Widget (Optional filler) */}
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-sm shadow-none p-5 text-white">
            <h3 className="font-semibold text-lg mb-2">สรุปประจำวัน</h3>
            <p className="text-blue-100 text-sm mb-4">
              วันนี้มีโครงการที่กำลังดำเนินการ {globalStats.onTrack + globalStats.delayed} โครงการ
              โดยมี {globalStats.delayed} โครงการที่ต้องดูแลเป็นพิเศษ
            </p>
            <div className="flex items-center gap-2 text-xs font-medium bg-white/20 px-3 py-2 rounded-sm self-start inline-flex backdrop-blur-sm">
              <Clock className="w-4 h-4" />
              อัปเดตข้อมูลล่าสุด: {format(new Date(), 'HH:mm')} น.
            </div>
          </div>

        </div>
      </div>
    </div >
  );
}
