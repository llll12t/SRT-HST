'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar, Download, Loader2, FolderKanban, TrendingUp, AlertTriangle } from 'lucide-react';
import SCurveChart from '@/components/charts/SCurveChart';
import GanttChart from '@/components/charts/GanttChart';
import StatsCards from '@/components/dashboard/StatsCards';
import { Project, Task, SCurveDataPoint } from '@/types/construction';
import { getProjects, getAllTasks } from '@/lib/firestore';

export default function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [projectsData, tasksData] = await Promise.all([
        getProjects(),
        getAllTasks()
      ]);
      setProjects(projectsData);
      setTasks(tasksData);

      // Auto-select first project if available
      if (projectsData.length > 0) {
        setSelectedProjectId(projectsData[0].id);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter tasks by selected project
  const filteredTasks = selectedProjectId === 'all'
    ? tasks
    : tasks.filter(t => t.projectId === selectedProjectId);

  // Get selected project
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Calculate overall stats
  const overallStats = {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'in-progress').length,
    totalTasks: tasks.length,
    completedTasks: tasks.filter(t => t.status === 'completed').length,
    inProgressTasks: tasks.filter(t => t.status === 'in-progress').length,
    overallProgress: projects.length > 0
      ? projects.reduce((sum, p) => sum + (Number(p.overallProgress) || 0), 0) / projects.length
      : 0
  };

  // Generate S-Curve data from tasks (simplified)
  const generateSCurveData = (): SCurveDataPoint[] => {
    if (filteredTasks.length === 0) return [];

    const totalDuration = filteredTasks.reduce((sum, t) => sum + (Number(t.planDuration) || 0), 0);
    if (totalDuration === 0) return [];

    // Generate weekly data points
    const weeks: SCurveDataPoint[] = [];
    let cumulativePlanned = 0;
    let cumulativeActual = 0;

    for (let i = 1; i <= 20; i++) {
      // Simplified S-curve generation
      const plannedProgress = (100 / 20) * (1 + Math.sin((i / 20 - 0.5) * Math.PI)) / 2;
      cumulativePlanned = Math.min(100, cumulativePlanned + plannedProgress);

      // Actual based on current task progress
      const actualProgress = filteredTasks.reduce((sum, t) =>
        sum + ((Number(t.planDuration) || 0) * (Number(t.progress) || 0) / 100), 0
      ) / totalDuration * 100;
      cumulativeActual = Math.min(actualProgress, cumulativePlanned * 1.1);

      weeks.push({
        week: i,
        date: `W${i}`,
        plannedProgress: plannedProgress,
        actualProgress: i <= 10 ? actualProgress / 20 : 0,
        cumulativePlanned: Math.round(cumulativePlanned * 100) / 100,
        cumulativeActual: i <= 10 ? Math.round(cumulativeActual * 100) / 100 : cumulativeActual * (i / 20)
      });
    }

    return weeks;
  };

  const scurveData = generateSCurveData();
  const currentProgress = selectedProject
    ? Number(selectedProject.overallProgress) || 0
    : overallStats.overallProgress;

  // Get tasks that need attention (not started but should be)
  const tasksNeedAttention = filteredTasks
    .filter(t => t.status === 'not-started' && (Number(t.planDuration) || 0) > 0)
    .slice(0, 5);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
      </div>
    );
  }

  // Empty state
  if (projects.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5">ภาพรวมโครงการก่อสร้าง</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <FolderKanban className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">ยินดีต้อนรับ!</h2>
          <p className="text-gray-500 mb-6">เริ่มต้นด้วยการสร้างโครงการแรกของคุณ</p>
          <Link
            href="/projects"
            className="px-6 py-3 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors inline-block"
          >
            สร้างโครงการใหม่
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 text-sm mt-0.5 flex items-center gap-1.5">
            <Calendar className="w-4 h-4" />
            อัปเดตล่าสุด: {new Date().toLocaleDateString('th-TH', {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:border-blue-500"
          >
            <option value="all">ทุกโครงการ</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>

          <button className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2">
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-gray-500 text-xs font-medium">โครงการทั้งหมด</p>
          <p className="text-2xl font-semibold text-gray-900 mt-1">{overallStats.totalProjects}</p>
          <p className="text-xs text-blue-600 mt-1">{overallStats.activeProjects} กำลังดำเนินการ</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-gray-500 text-xs font-medium">ความคืบหน้ารวม</p>
          <p className="text-2xl font-semibold text-blue-600 mt-1">{currentProgress.toFixed(2)}%</p>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${currentProgress}%` }}
            />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-gray-500 text-xs font-medium">งานเสร็จสิ้น</p>
          <p className="text-2xl font-semibold text-green-600 mt-1">
            {selectedProjectId === 'all'
              ? overallStats.completedTasks
              : filteredTasks.filter(t => t.status === 'completed').length}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            จาก {selectedProjectId === 'all' ? overallStats.totalTasks : filteredTasks.length} งาน
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-gray-500 text-xs font-medium">กำลังดำเนินการ</p>
          <p className="text-2xl font-semibold text-amber-600 mt-1">
            {selectedProjectId === 'all'
              ? overallStats.inProgressTasks
              : filteredTasks.filter(t => t.status === 'in-progress').length}
          </p>
        </div>
      </div>

      {/* S-Curve Chart */}
      {scurveData.length > 0 && (
        <SCurveChart
          data={scurveData}
          currentProgress={currentProgress}
          title={selectedProject ? `S-Curve - ${selectedProject.name}` : 'S-Curve - ภาพรวม'}
        />
      )}

      {/* Gantt Chart */}
      {filteredTasks.length > 0 && (
        <GanttChart
          tasks={filteredTasks}
          startDate={selectedProject?.startDate || '2024-01-01'}
          endDate={selectedProject?.endDate || '2025-12-31'}
        />
      )}

      {/* Bottom Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks Need Attention */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <h3 className="text-base font-semibold text-gray-900">งานที่ต้องเร่งดำเนินการ</h3>
          </div>

          {tasksNeedAttention.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">ไม่มีงานที่ต้องเร่ง</p>
          ) : (
            <div className="space-y-2">
              {tasksNeedAttention.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{task.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{task.category}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    <span className="text-xs text-gray-400">{Number(task.planDuration)} วัน</span>
                    <span className="badge badge-warning">รอเริ่มงาน</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredTasks.filter(t => t.status === 'not-started').length > 5 && (
            <Link
              href="/tasks"
              className="block text-center text-sm text-blue-600 hover:text-blue-700 mt-4"
            >
              ดูงานทั้งหมด →
            </Link>
          )}
        </div>

        {/* Project Summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-4">สรุปโครงการ</h3>

          {selectedProject ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">เจ้าของโครงการ</span>
                <span className="text-gray-900 font-medium">{selectedProject.owner}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">วันเริ่มต้น</span>
                <span className="text-gray-900 font-medium">{selectedProject.startDate}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">วันสิ้นสุด</span>
                <span className="text-gray-900 font-medium">{selectedProject.endDate}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">จำนวนงาน</span>
                <span className="text-gray-900 font-medium">{filteredTasks.length} รายการ</span>
              </div>

              <div className="pt-3 mt-3 border-t border-gray-100">
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-gray-500">ความคืบหน้า</span>
                  <span className="text-blue-600 font-semibold">{currentProgress.toFixed(2)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 rounded-full"
                    style={{ width: `${currentProgress}%` }}
                  />
                </div>
              </div>

              <Link
                href={`/projects/${selectedProject.id}`}
                className="block text-center text-sm text-blue-600 hover:text-blue-700 mt-4"
              >
                ดูรายละเอียด →
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {projects.slice(0, 3).map((project) => (
                <Link
                  key={project.id}
                  href={`/projects/${project.id}`}
                  className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">{project.name}</p>
                    <span className="text-sm text-blue-600 font-medium">
                      {(Number(project.overallProgress) || 0).toFixed(1)}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
