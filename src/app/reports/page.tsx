'use client';

import React, { useState, useEffect } from 'react';
import {
    FileSpreadsheet,
    Download,
    Calendar,
    FileText,
    BarChart3,
    TrendingUp,
    Clock,
    Loader2,
    ChevronRight,
    CheckCircle2
} from 'lucide-react';
import { Project, Task } from '@/types/construction';
import { getProjects, getTasks } from '@/lib/firestore';

export default function ReportsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
    const [generatingReport, setGeneratingReport] = useState<string | null>(null);
    const [generatedReports, setGeneratedReports] = useState<{ id: string; name: string; date: string; type: string }[]>([]);

    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const projectsData = await getProjects();
            setProjects(projectsData);
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    const selectedProject = projects.find(p => p.id === selectedProjectId);

    // Report types
    const reportTypes = [
        {
            id: 'progress',
            name: 'รายงานความคืบหน้า',
            description: 'สรุปความคืบหน้าโครงการทั้งหมด',
            icon: TrendingUp,
            color: 'bg-blue-50 text-blue-600',
        },
        {
            id: 's-curve',
            name: 'รายงาน S-Curve',
            description: 'เปรียบเทียบแผนงานกับผลงานจริง',
            icon: BarChart3,
            color: 'bg-green-50 text-green-600',
        },
        {
            id: 'weekly',
            name: 'รายงานประจำสัปดาห์',
            description: 'สรุปผลการดำเนินงานรายสัปดาห์',
            icon: Calendar,
            color: 'bg-purple-50 text-purple-600',
        },
        {
            id: 'tasks',
            name: 'รายงานสถานะงาน',
            description: 'รายละเอียดสถานะงานทั้งหมด',
            icon: FileText,
            color: 'bg-amber-50 text-amber-600',
        },
    ];

    // Generate report
    const generateReport = async (reportType: string, format: 'pdf' | 'excel') => {
        setGeneratingReport(reportType);

        try {
            // Fetch project tasks
            const tasks = selectedProjectId === 'all'
                ? []
                : await getTasks(selectedProjectId);

            // Simulate report generation
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Create report data
            const reportName = `${reportTypes.find(r => r.id === reportType)?.name || 'รายงาน'} - ${selectedProject?.name || 'ทุกโครงการ'}`;
            const newReport = {
                id: `rpt-${Date.now()}`,
                name: reportName,
                date: new Date().toLocaleString('th-TH'),
                type: format.toUpperCase()
            };

            setGeneratedReports(prev => [newReport, ...prev]);

            // Create downloadable content
            if (format === 'excel') {
                downloadExcel(tasks, reportName);
            } else {
                downloadPDF(tasks, reportName);
            }

        } catch (error) {
            console.error('Error generating report:', error);
            alert('เกิดข้อผิดพลาดในการสร้างรายงาน');
        } finally {
            setGeneratingReport(null);
        }
    };

    // Download Excel (CSV format)
    const downloadExcel = (tasks: Task[], reportName: string) => {
        let csvContent = 'ลำดับ,ชื่องาน,หมวดหมู่,น้ำหนัก(%),Progress(%),สถานะ,วันเริ่มต้น,วันสิ้นสุด\n';

        tasks.forEach((task, index) => {
            const status = task.status === 'completed' ? 'เสร็จสิ้น' :
                task.status === 'in-progress' ? 'กำลังดำเนินการ' : 'ยังไม่เริ่ม';
            csvContent += `${index + 1},"${task.name}","${task.category}",${task.weight},${task.progress},${status},${task.planStartDate},${task.planEndDate}\n`;
        });

        const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${reportName}.csv`;
        link.click();
    };

    // Download PDF (simple HTML to print)
    const downloadPDF = (tasks: Task[], reportName: string) => {
        const totalWeight = tasks.reduce((sum, t) => sum + (Number(t.weight) || 0), 0);
        const weightedProgress = tasks.reduce((sum, t) =>
            sum + ((Number(t.weight) || 0) * (Number(t.progress) || 0) / 100), 0
        );
        const overallProgress = totalWeight > 0 ? (weightedProgress / totalWeight) * 100 : 0;

        const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>${reportName}</title>
        <style>
          body { font-family: 'Sarabun', sans-serif; padding: 40px; }
          h1 { color: #1e3a5f; border-bottom: 2px solid #2563eb; padding-bottom: 10px; }
          .summary { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; }
          .summary-item { display: inline-block; margin-right: 40px; }
          .summary-label { color: #64748b; font-size: 12px; }
          .summary-value { font-size: 24px; font-weight: bold; color: #1e293b; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
          th { background: #f1f5f9; font-weight: 600; }
          .progress-bar { width: 100px; height: 8px; background: #e2e8f0; border-radius: 4px; }
          .progress-fill { height: 100%; background: #2563eb; border-radius: 4px; }
          .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
          .status-completed { background: #dcfce7; color: #16a34a; }
          .status-progress { background: #dbeafe; color: #2563eb; }
          .status-pending { background: #f3f4f6; color: #6b7280; }
          .footer { margin-top: 40px; text-align: center; color: #94a3b8; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>${reportName}</h1>
        <p>วันที่สร้าง: ${new Date().toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        
        <div class="summary">
          <div class="summary-item">
            <div class="summary-label">ความคืบหน้ารวม</div>
            <div class="summary-value" style="color: #2563eb;">${overallProgress.toFixed(2)}%</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">จำนวนงานทั้งหมด</div>
            <div class="summary-value">${tasks.length}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">งานเสร็จสิ้น</div>
            <div class="summary-value" style="color: #16a34a;">${tasks.filter(t => t.status === 'completed').length}</div>
          </div>
          <div class="summary-item">
            <div class="summary-label">กำลังดำเนินการ</div>
            <div class="summary-value" style="color: #d97706;">${tasks.filter(t => t.status === 'in-progress').length}</div>
          </div>
        </div>
        
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>ชื่องาน</th>
              <th>หมวดหมู่</th>
              <th>น้ำหนัก</th>
              <th>Progress</th>
              <th>สถานะ</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.map((task, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${task.name}</td>
                <td>${task.category}</td>
                <td>${Number(task.weight).toFixed(2)}%</td>
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div class="progress-bar">
                      <div class="progress-fill" style="width: ${task.progress}%"></div>
                    </div>
                    <span>${Number(task.progress)}%</span>
                  </div>
                </td>
                <td>
                  <span class="status ${task.status === 'completed' ? 'status-completed' :
                task.status === 'in-progress' ? 'status-progress' : 'status-pending'
            }">
                    ${task.status === 'completed' ? 'เสร็จสิ้น' :
                task.status === 'in-progress' ? 'กำลังดำเนินการ' : 'ยังไม่เริ่ม'}
                  </span>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        
        <div class="footer">
          <p>SRT-HST Construction Management System</p>
        </div>
      </body>
      </html>
    `;

        const printWindow = window.open('', '_blank');
        if (printWindow) {
            printWindow.document.write(htmlContent);
            printWindow.document.close();
            printWindow.print();
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <FileSpreadsheet className="w-6 h-6 text-blue-600" />
                        รายงาน
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">สร้างและดาวน์โหลดรายงานโครงการ</p>
                </div>

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
            </div>

            {/* Quick Stats */}
            {selectedProject && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <p className="text-gray-500 text-xs font-medium">โครงการ</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{selectedProject.name}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <p className="text-gray-500 text-xs font-medium">ความคืบหน้า</p>
                        <p className="text-xl font-semibold text-blue-600 mt-1">
                            {(Number(selectedProject.overallProgress) || 0).toFixed(2)}%
                        </p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <p className="text-gray-500 text-xs font-medium">วันเริ่มต้น</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{selectedProject.startDate}</p>
                    </div>
                    <div className="bg-white rounded-lg border border-gray-200 p-4">
                        <p className="text-gray-500 text-xs font-medium">วันสิ้นสุด</p>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{selectedProject.endDate}</p>
                    </div>
                </div>
            )}

            {/* Report Types */}
            <div>
                <h2 className="text-base font-semibold text-gray-900 mb-3">เลือกประเภทรายงาน</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {reportTypes.map((report) => (
                        <div
                            key={report.id}
                            className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all"
                        >
                            <div className="flex items-start gap-3 mb-3">
                                <div className={`p-2.5 rounded-lg ${report.color}`}>
                                    <report.icon className="w-5 h-5" />
                                </div>
                                <div className="flex-1">
                                    <h3 className="font-medium text-gray-900">{report.name}</h3>
                                    <p className="text-sm text-gray-500 mt-0.5">{report.description}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 mt-3">
                                <button
                                    onClick={() => generateReport(report.id, 'pdf')}
                                    disabled={generatingReport === report.id || selectedProjectId === 'all'}
                                    className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    {generatingReport === report.id ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Download className="w-4 h-4" />
                                    )}
                                    PDF
                                </button>
                                <button
                                    onClick={() => generateReport(report.id, 'excel')}
                                    disabled={generatingReport === report.id || selectedProjectId === 'all'}
                                    className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                                >
                                    <Download className="w-4 h-4" />
                                    Excel
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {selectedProjectId === 'all' && (
                    <p className="text-amber-600 text-sm mt-3">* กรุณาเลือกโครงการก่อนสร้างรายงาน</p>
                )}
            </div>

            {/* Generated Reports */}
            {generatedReports.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-200">
                        <h2 className="font-semibold text-gray-900">รายงานที่สร้างล่าสุด</h2>
                        <p className="text-gray-500 text-sm mt-0.5">รายงานที่สร้างในเซสชันนี้</p>
                    </div>

                    <div className="divide-y divide-gray-100">
                        {generatedReports.map((report) => (
                            <div key={report.id} className="px-5 py-3 flex items-center justify-between hover:bg-gray-50">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-green-50 rounded-lg">
                                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-medium text-gray-900">{report.name}</p>
                                        <p className="text-xs text-gray-500">{report.date}</p>
                                    </div>
                                </div>
                                <span className={`badge ${report.type === 'PDF' ? 'badge-danger' : 'badge-success'}`}>
                                    {report.type}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Report Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-medium text-blue-900 mb-2">วิธีใช้งาน</h3>
                <ul className="text-sm text-blue-700 space-y-1">
                    <li>1. เลือกโครงการที่ต้องการสร้างรายงาน</li>
                    <li>2. เลือกประเภทรายงานและรูปแบบไฟล์ (PDF หรือ Excel)</li>
                    <li>3. ระบบจะดาวน์โหลดรายงานโดยอัตโนมัติ</li>
                </ul>
            </div>
        </div>
    );
}
