'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FolderGit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  CalendarDays,
  BarChart3,
  GanttChartSquare,
  Building2,
  Search,
  Filter,
  Target,
  ShoppingBag
} from 'lucide-react';
import { format, parseISO, differenceInDays, isAfter, isBefore } from 'date-fns';
import { Project, Task } from '@/types/construction';
import { getProjects, getAllTasks } from '@/lib/firestore';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'planning' | 'in-progress' | 'completed' | 'on-hold'>('active');

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

  const calculatePlannedProgress = (projectId: string, projectStart: string, projectEnd: string): number => {
    const projectTasks = tasks.filter(t => t.projectId === projectId);
    if (projectTasks.length === 0) return 0;

    const now = new Date();
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

      if (isBefore(end, now)) {
        plannedEarnedValue += weight;
      } else if (isAfter(start, now)) {
        plannedEarnedValue += 0;
      } else {
        const daysToNow = differenceInDays(now, start) + 1;
        const progressRatio = Math.max(0, Math.min(1, daysToNow / duration));
        plannedEarnedValue += (weight * progressRatio);
      }
    });

    return totalWeight > 0 ? (plannedEarnedValue / totalWeight) * 100 : 0;
  };

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

  const processedProjects = projects.map(project => {
    const planned = calculatePlannedProgress(project.id, project.startDate, project.endDate);
    const actual = calculateActualProgress(project.id);
    const variance = actual - planned;
    const status = variance < -5 ? 'delayed' : variance > 5 ? 'ahead' : 'on-track';

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

  const globalStats = {
    total: projects.length,
    delayed: processedProjects.filter(p => p.stats.status === 'delayed').length,
    onTrack: processedProjects.filter(p => p.stats.status === 'on-track').length,
    completed: projects.filter(p => p.status === 'completed').length
  };

  const today = new Date();
  const criticalTasks = tasks
    .filter(t => t.progress < 100)
    .map(t => {
      const planEnd = parseDate(t.planEndDate);
      const planStart = parseDate(t.planStartDate);
      let isDelayed = false;
      let delayLabel = '';

      if (isBefore(planEnd, today)) {
        isDelayed = true;
        delayLabel = 'Term Overdue';
      } else if (isBefore(planStart, today) && t.progress === 0) {
        isDelayed = true;
        delayLabel = 'Start Delayed';
      }

      return { ...t, isDelayed, delayLabel, planEnd };
    })
    .filter(t => t.isDelayed)
    .sort((a, b) => a.planEnd.getTime() - b.planEnd.getTime())
    .slice(0, 5);

  const filteredProjects = processedProjects.filter(project => {
    const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (project.description || '').toLowerCase().includes(searchQuery.toLowerCase());

    let matchesStatus = true;
    if (statusFilter === 'all') {
      matchesStatus = true;
    } else if (statusFilter === 'active') {
      matchesStatus = ['planning', 'in-progress'].includes(project.status);
    } else {
      matchesStatus = project.status === statusFilter;
    }

    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mb-4"></div>
        <p className="text-gray-500 text-base">Loading Portfolio...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full mx-auto min-h-screen text-gray-900 px-6 sm:px-8 lg:px-10 py-8 pb-12 text-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5 border-b border-gray-200 pb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Portfolio Dashboard</h1>
          <p className="text-gray-500 text-sm mt-1">Overview as of {format(new Date(), 'd MMM yyyy, HH:mm')}</p>
        </div>
        <Link
          href="/projects"
          className="inline-flex items-center justify-center px-4 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
        >
          <FolderGit2 className="w-4 h-4 mr-2" />
          Manage Projects
        </Link>
      </div>

      {/* Overview Stats Cards - Colorful */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="p-5 rounded-xl border border-blue-100 bg-blue-50/50 flex flex-col justify-between h-[112px] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <FolderGit2 className="w-16 h-16 text-blue-600" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Total Projects</p>
            <div className="p-1.5 bg-blue-100 rounded-md">
              <FolderGit2 className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          <p className="relative z-10 text-3xl font-bold text-gray-900 leading-none">{globalStats.total}</p>
        </div>

        <div className="p-5 rounded-xl border border-green-100 bg-green-50/50 flex flex-col justify-between h-[112px] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <CheckCircle2 className="w-16 h-16 text-green-600" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <p className="text-xs font-bold text-green-600 uppercase tracking-wider">On Track</p>
            <div className="p-1.5 bg-green-100 rounded-md">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
            </div>
          </div>
          <div className="relative z-10 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-green-700 leading-none">{globalStats.onTrack}</p>
            <span className="text-xs text-green-600 font-medium">projects</span>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-red-100 bg-red-50/50 flex flex-col justify-between h-[112px] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <AlertCircle className="w-16 h-16 text-red-600" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <p className="text-xs font-bold text-red-600 uppercase tracking-wider">Delayed</p>
            <div className="p-1.5 bg-red-100 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-600" />
            </div>
          </div>
          <div className="relative z-10 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-red-700 leading-none">{globalStats.delayed}</p>
            <span className="text-xs text-red-600 font-medium">projects</span>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-amber-100 bg-amber-50/50 flex flex-col justify-between h-[112px] relative overflow-hidden">
          <div className="absolute top-0 right-0 p-3 opacity-10">
            <Clock className="w-16 h-16 text-amber-600" />
          </div>
          <div className="relative z-10 flex justify-between items-start">
            <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Critical Tasks</p>
            <div className="p-1.5 bg-amber-100 rounded-md">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
          </div>
          <div className="relative z-10 flex items-baseline gap-2">
            <p className="text-3xl font-bold text-amber-700 leading-none">{criticalTasks.length}</p>
            <span className="text-xs text-amber-600 font-medium">overdue</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content: Project List */}
        <div className="lg:col-span-2 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-50/80 p-4 rounded-xl border border-gray-200">
            <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gray-500" />
              Project Status
            </h2>

            <div className="flex gap-3 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full sm:w-56 pl-9 pr-3 py-2 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-gray-400"
                />
              </div>

              <div className="relative">
                <Filter className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="pl-9 pr-8 py-2 bg-white border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all font-medium text-gray-600 cursor-pointer hover:bg-gray-50 appearance-none"
                >
                  <option value="active">Active Projects</option>
                  <option value="all">All Projects</option>
                  <option disabled>----------</option>
                  <option value="planning">Planning</option>
                  <option value="in-progress">In Progress</option>
                  <option value="on-hold">On Hold</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
          </div>

          {filteredProjects.length === 0 ? (
            <div className="text-center py-14 border border-dashed border-gray-300 rounded-xl">
              <p className="text-gray-500 text-sm">No projects match criteria.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredProjects.map(project => {
                const isCompleted = project.status === 'completed';
                const isOnHold = project.status === 'on-hold';

                return (
                  <div
                    key={project.id}
                    className={`group rounded-xl border p-6 transition-all hover:shadow-md bg-white
                                            ${isCompleted ? 'border-green-200 bg-green-50/5' :
                        isOnHold ? 'border-amber-200 bg-amber-50/5' :
                          'border-gray-200 hover:border-blue-300'}
                                        `}
                  >
                    <div className="flex justify-between items-start mb-5">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                          <h3 className="font-semibold text-lg text-gray-900 group-hover:text-blue-700 transition-colors">
                            {project.name}
                          </h3>
                          {isCompleted && <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs uppercase font-bold tracking-wide rounded-full">Completed</span>}
                          {isOnHold && <span className="px-2.5 py-0.5 bg-amber-100 text-amber-700 text-xs uppercase font-bold tracking-wide rounded-full">On Hold</span>}
                        </div>
                        <div className="flex items-center gap-5 text-sm text-gray-500">
                          <span className="flex items-center gap-1.5 bg-gray-50 px-2.5 py-1 rounded text-gray-600">
                            <CalendarDays className="w-3.5 h-3.5" />
                            {format(parseDate(project.startDate), 'MMM d')} - {format(parseDate(project.endDate), 'MMM d, yy')}
                          </span>
                          <span className="text-gray-300">|</span>
                          <div className={`flex items-center gap-1.5 font-bold
                                                        ${project.stats.status === 'delayed' && !isCompleted ? 'text-red-600' :
                              project.stats.status === 'ahead' || isCompleted ? 'text-green-600' :
                                'text-blue-600'}`}>
                            {project.stats.status === 'delayed' && !isCompleted ? 'Delayed' :
                              project.stats.status === 'ahead' || isCompleted ? 'Ahead' : 'On Track'}
                            {!isCompleted && !isOnHold && (
                              <span className="text-xs font-medium opacity-80 bg-opacity-20 px-1.5 py-0.5 rounded ml-1 bg-current">
                                {project.stats.variance > 0 ? '+' : ''}{project.stats.variance.toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Link href={`/projects/${project.id}`} className="flex items-center justify-center w-9 h-9 text-gray-400 hover:text-white hover:bg-blue-600 rounded-full transition-all">
                        <ArrowRight className="w-5 h-5" />
                      </Link>
                    </div>

                    {/* Progress Bars - Updated Aesthetics */}
                    <div className="grid grid-cols-2 gap-7 mb-6">
                      <div>
                        <div className="flex justify-between text-xs mb-2.5 text-gray-500 uppercase tracking-wider font-semibold">
                          <span className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-blue-500"></div> Plan</span>
                          <span className="text-gray-700">{isCompleted ? '100%' : project.stats.planned.toFixed(1) + '%'}</span>
                        </div>
                        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${isCompleted ? 'bg-green-500' : 'bg-blue-500'}`}
                            style={{ width: `${isCompleted ? 100 : project.stats.planned}%` }}
                          ></div>
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs mb-2.5 text-gray-500 uppercase tracking-wider font-semibold">
                          <span className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${project.stats.status === 'delayed' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                            Actual
                          </span>
                          <span className={`${project.stats.status === 'delayed' ? 'text-red-600' : 'text-green-600'}`}>
                            {isCompleted ? '100%' : project.stats.actual.toFixed(1) + '%'}
                          </span>
                        </div>
                        <div className="h-1 w-full bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${project.stats.status === 'delayed' && !isCompleted ? 'bg-red-500' : 'bg-green-500'}`}
                            style={{ width: `${isCompleted ? 100 : project.stats.actual}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Quick Links Footer - Colorful buttons */}
                    <div className="flex items-center gap-2.5 pt-5 border-t border-gray-100 flex-wrap">
                      <Link href={`/gantt/${project.id}`} className="group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-blue-50 hover:text-blue-700 rounded-md transition-all border border-gray-200 hover:border-blue-200">
                        <GanttChartSquare className="w-4 h-4 text-gray-400 group-hover:text-blue-500" /> Gantt
                      </Link>
                      <Link href={`/scurve/${project.id}`} className="group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 rounded-md transition-all border border-gray-200 hover:border-indigo-200">
                        <BarChart3 className="w-4 h-4 text-gray-400 group-hover:text-indigo-500" /> S-Curve
                      </Link>
                      <Link href={`/gantt-4w/${project.id}`} className="group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-purple-50 hover:text-purple-700 rounded-md transition-all border border-gray-200 hover:border-purple-200">
                        <CalendarDays className="w-4 h-4 text-gray-400 group-hover:text-purple-500" /> 4-Week
                      </Link>
                      <Link href={`/cost-code/${project.id}`} className="group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-700 rounded-md transition-all border border-gray-200 hover:border-emerald-200">
                        <Target className="w-4 h-4 text-gray-400 group-hover:text-emerald-500" /> Cost
                      </Link>
                      <Link href={`/procurement/${project.id}`} className="group flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-amber-50 hover:text-amber-700 rounded-md transition-all border border-gray-200 hover:border-amber-200">
                        <ShoppingBag className="w-4 h-4 text-gray-400 group-hover:text-amber-500" /> Procure
                      </Link>

                      <span className="ml-auto text-sm font-medium text-gray-400 bg-gray-50 px-2.5 py-1.5 rounded-md">
                        {project.stats.completedTasks} / {project.stats.totalTasks} tasks
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Sidebar: Critical Tasks & Summary */}
        <div className="space-y-5">
          {/* Critical Tasks Panel */}
          <div className="bg-white rounded-xl border border-red-100 shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 bg-red-50/50 border-b border-red-100">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <h3 className="font-bold text-sm text-red-900">Action Required</h3>
            </div>

            <div className="p-5">
              {criticalTasks.length === 0 ? (
                <div className="py-7 text-center">
                  <CheckCircle2 className="w-8 h-8 text-green-100 mx-auto mb-2" />
                  <p className="text-sm text-gray-500">No critical delays.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {criticalTasks.map(task => {
                    const project = projects.find(p => p.id === task.projectId);
                    return (
                      <div key={task.id} className="group p-4 bg-white rounded-lg border border-red-100 hover:border-red-300 hover:shadow-sm transition-all relative">
                        <div className="absolute left-0 top-0 bottom-0 bg-red-500 rounded-l-md"></div>
                        <div className="pl-3">
                          <div className="flex justify-between items-start mb-2">
                            <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full uppercase tracking-wide border border-red-100">
                              {task.delayLabel}
                            </span>
                            <span className="text-sm text-gray-400 font-medium truncate max-w-[120px]">
                              {project?.name}
                            </span>
                          </div>
                          <p className="text-sm font-semibold text-gray-800 mb-1.5 line-clamp-1 group-hover:text-red-700 transition-colors">{task.name}</p>
                          <div className="flex justify-between text-sm text-gray-500 font-medium">
                            <span>Due: {format(parseDate(task.planEndDate), 'MMM d')}</span>
                            <span className="text-red-600">{task.progress}% done</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {criticalTasks.length > 0 && (
                <div className="mt-5 pt-4 text-center border-t border-gray-100">
                  <Link href="#" className="text-sm font-semibold text-red-600 hover:text-red-700 hover:underline">View all critical items</Link>
                </div>
              )}
            </div>
          </div>

          {/* Daily Brief */}
          <div className="bg-slate-900 rounded-xl p-6 text-white shadow-lg relative overflow-hidden">
            {/* Abstract Background Decoration */}
            <div className="absolute top-0 right-0 -mt-2 -mr-2 w-20 h-20 bg-blue-500 rounded-full opacity-10 blur-xl"></div>
            <div className="absolute bottom-0 left-0 -mb-2 -ml-2 w-16 h-16 bg-purple-500 rounded-full opacity-10 blur-xl"></div>

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4 text-blue-300">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-bold uppercase tracking-wider">Daily Brief</span>
              </div>
              <p className="text-sm text-slate-300 leading-relaxed mb-5">
                You have <span className="text-white font-bold">{globalStats.onTrack + globalStats.delayed} active projects</span>.
                <br />
                <span className={globalStats.delayed > 0 ? "text-red-300 font-medium" : "text-green-300 font-medium"}>
                  {globalStats.delayed} project{globalStats.delayed !== 1 && 's'} requiring attention.
                </span>
              </p>
              <div className="h-px bg-slate-700/50 my-4"></div>
              <div className="flex justify-between text-sm text-slate-400">
                <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div> System Online</span>
                <span>v2.1.0</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div >
  );
}
