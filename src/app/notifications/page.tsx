'use client';

import React, { useState, useEffect } from 'react';
import { isSameWeek, subWeeks, parseISO } from 'date-fns';
import {
    Bell, CheckCircle2, AlertTriangle, Send, Loader2, Info, CheckSquare, Square, FileText, Check
} from 'lucide-react';
import {
    getWeeklyCostStats,
    generateWeeklyReportFlexMessage
} from '@/lib/report-service';
import {
    generateTasksFlexMessage,
    generateProjectProgressFlexMessage,
    generateProcurementFlexMessage
} from '@/lib/line-flex-templates';
import { sendLineFlexMessageAction } from '@/app/actions/line';
import { getProjects, getAllTasks } from '@/lib/firestore';
import { Project, Task } from '@/types/construction';
import Link from 'next/link';

export default function NotificationsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedProjectId, setSelectedProjectId] = useState<string>('all');

    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);

    const [lineSettings, setLineSettings] = useState({ token: '', targets: [] as string[] });

    const [selectedReports, setSelectedReports] = useState({
        progress: true,
        thisWeek: true,
        lastWeek: true,
        procurement: true,
        sCurve: true
    });

    const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);

    useEffect(() => {
        const fetchBaseData = async () => {
            setLoading(true);
            try {
                const [projectsData, tasksData] = await Promise.all([
                    getProjects(),
                    getAllTasks()
                ]);
                const activeProjects = projectsData.filter(p => p.status !== 'completed' && (p.status as string) !== 'cancelled');
                setProjects(activeProjects);
                setTasks(tasksData);
            } catch (error) {
                console.error("Error fetching project data", error);
            } finally {
                setLoading(false);
            }
        };

        const loadSettings = () => {
            try {
                const stored = localStorage.getItem('srt-hst-settings');
                if (stored) {
                    const parsed = JSON.parse(stored);
                    if (parsed?.notifications) {
                        const token = parsed.notifications.lineChannelAccessToken || '';
                        const targets = [];
                        if (parsed.notifications.lineGroupId) targets.push(parsed.notifications.lineGroupId);
                        if (parsed.notifications.lineUserIds && parsed.notifications.lineUserIds.length > 0) {
                            targets.push(...parsed.notifications.lineUserIds.filter((id: string) => id.trim() !== ''));
                        }
                        setLineSettings({ token, targets });
                    }
                }
            } catch (e) {
                console.error('Failed to parse settings', e);
            }
        };

        fetchBaseData();
        loadSettings();
    }, []);

    const toggleReport = (key: keyof typeof selectedReports) => {
        setSelectedReports(prev => ({ ...prev, [key]: !prev[key] }));
        setAlertMsg(null);
    };

    const handleSendReports = async () => {
        setAlertMsg(null);
        if (!lineSettings.token || lineSettings.targets.length === 0) {
            setAlertMsg({ type: 'error', text: 'กรุณาตั้งค่า LINE API Token และ Target ID ในหน้าการตั้งค่า (Settings) ก่อนส่ง' });
            return;
        }

        const reportsSelectedCount = Object.values(selectedReports).filter(Boolean).length;
        if (reportsSelectedCount === 0) {
            setAlertMsg({ type: 'error', text: 'โปรดเลือกรายงานอย่างน้อย 1 รายการ' });
            return;
        }

        setSending(true);
        try {
            const { stats, project } = await getWeeklyCostStats(selectedProjectId);

            const projectTasks = selectedProjectId === 'all'
                ? tasks
                : tasks.filter(t => t.projectId === selectedProjectId);

            const now = new Date();
            const lastWeek = subWeeks(now, 1);

            const messagesToSend: any[] = [];

            if (selectedReports.progress) {
                const progressMessage = project
                    ? generateProjectProgressFlexMessage(project)
                    : generateProjectProgressFlexMessage({ name: 'สรุปทุกโครงการ', overallProgress: stats.totalBudget > 0 ? (stats.earnedToDate / stats.totalBudget) * 100 : 0 } as any);
                messagesToSend.push(progressMessage);
            }

            if (selectedReports.thisWeek) {
                const thisWeekTasks = projectTasks.filter(t => {
                    if (!t.planStartDate || !t.planEndDate) return false;
                    try {
                        const start = parseISO(t.planStartDate);
                        const end = parseISO(t.planEndDate);
                        return t.status !== 'completed' &&
                            (isSameWeek(start, now, { weekStartsOn: 1 }) ||
                                isSameWeek(end, now, { weekStartsOn: 1 }) ||
                                (start <= now && end >= now));
                    } catch { return false; }
                });
                messagesToSend.push(generateTasksFlexMessage('📅 แผนงานสัปดาห์นี้', thisWeekTasks, project, '#2563eb'));
            }

            if (selectedReports.lastWeek) {
                const lastWeekTasks = projectTasks.filter(t => {
                    if (!t.planStartDate || !t.planEndDate) return false;
                    try {
                        const start = parseISO(t.planStartDate);
                        const end = parseISO(t.planEndDate);
                        return (isSameWeek(start, lastWeek, { weekStartsOn: 1 }) ||
                            isSameWeek(end, lastWeek, { weekStartsOn: 1 }) ||
                            (start <= lastWeek && end >= lastWeek));
                    } catch { return false; }
                });
                messagesToSend.push(generateTasksFlexMessage('⏮️ งานสัปดาห์ที่ผ่านมา', lastWeekTasks, project, '#64748b'));
            }

            if (selectedReports.procurement) {
                const procTasks = projectTasks.filter(t => t.procurementStatus && t.procurementStatus !== 'delivered' && t.dateOfUse);
                messagesToSend.push(generateProcurementFlexMessage(procTasks, project));
            }

            if (selectedReports.sCurve) {
                const sCurveMessage = generateWeeklyReportFlexMessage(stats, project, now);
                messagesToSend.push(sCurveMessage);
            }

            let allFailures = 0;
            for (const targetId of lineSettings.targets) {
                for (const message of messagesToSend) {
                    const res = await sendLineFlexMessageAction(
                        lineSettings.token,
                        targetId,
                        message
                    );
                    if (!res.success) allFailures++;
                }
            }

            if (allFailures === 0) {
                setAlertMsg({ type: 'success', text: `ส่งรายงานจำนวน ${messagesToSend.length} รายการ ไปยัง ${lineSettings.targets.length} ปลายทาง เรียบร้อยแล้ว` });
            } else {
                setAlertMsg({ type: 'error', text: `ส่งสำเร็จบางส่วน การส่งล้มเหลวจำนวน ${allFailures} ครั้ง. ลองตรวจสอบการตั้งค่า LINE ใหม่` });
            }
        } catch (error: any) {
            console.error('Failed to send messages:', error);
            setAlertMsg({ type: 'error', text: `เกิดข้อผิดพลาด: ${error.message || 'Unknown error'}` });
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-200 pb-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Send className="w-6 h-6 text-blue-600" />
                        รายงานและการแจ้งเตือน
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">ส่งรายงานข้อมูลโครงการไปยังกลุ่ม LINE Official Account</p>
                </div>
            </div>

            {alertMsg && (
                <div className={`p-4 rounded border flex items-start gap-3 ${alertMsg.type === 'success' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                    {alertMsg.type === 'success' ? <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" /> : <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />}
                    <span>{alertMsg.text}</span>
                </div>
            )}

            {!lineSettings.token || lineSettings.targets.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded p-4 flex items-start gap-3">
                    <Info className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                    <div>
                        <h4 className="font-semibold text-amber-900">ยังไม่ได้ตั้งค่าการแจ้งเตือน LINE</h4>
                        <p className="text-sm text-amber-700 mt-1">คุณจำเป็นต้องตั้งค่า Channel Access Token และ Target ID เพื่อใช้งานฟีเจอร์นี้</p>
                        <Link href="/settings" className="text-sm font-medium text-amber-800 hover:text-amber-900 underline mt-2 inline-block">
                            ตั้งค่าแจ้งเตือน
                        </Link>
                    </div>
                </div>
            ) : (
                <div className="bg-blue-50 border border-blue-200 rounded p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
                    <div className="text-sm text-blue-800">
                        พร้อมส่งรายงานไปยัง <strong>{lineSettings.targets.length}</strong> ปลายทางที่ตั้งค่าไว้
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

                {/* Setting Left Column */}
                <div className="md:col-span-4 space-y-4">
                    <div className="bg-white rounded border border-gray-200 shadow-sm p-5">
                        <label className="block text-sm font-medium text-gray-700 mb-2">เลือกโครงการ</label>
                        <select
                            value={selectedProjectId}
                            onChange={(e) => setSelectedProjectId(e.target.value)}
                            className="bg-white border border-gray-300 rounded px-3 py-2 text-sm w-full focus:ring-1 focus:ring-blue-500 focus:border-blue-500 outline-none"
                        >
                            <option value="all">สรุปทุกโครงการรวมกัน</option>
                            {projects.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                        </select>
                        <p className="text-xs text-gray-500 mt-2">
                            หมายเหตุ: การเลือกส่งแบบ "ทุกโครงการรวมกัน" จะคำนวณกราฟรวมและดึงข้อมูลจากงานในทุกโปรเจค
                        </p>
                    </div>

                    <div className="bg-white rounded border border-gray-200 flex flex-col items-center justify-center p-6 text-center shadow-sm">
                        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
                            <Send className="w-8 h-8" />
                        </div>
                        <h3 className="font-semibold text-gray-900 mb-1">ยินยันการส่งรายงาน</h3>
                        <p className="text-sm text-gray-500 mb-6">กรุณาตรวจสอบหัวข้อรายงานที่ต้องการส่งก่อนกดยืนยัน รายงานจะถูกส่งเข้าแชท LINE ทันที</p>
                        <button
                            onClick={handleSendReports}
                            disabled={sending || (!lineSettings.token || lineSettings.targets.length === 0)}
                            className="w-full font-medium py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Bell className="w-5 h-5" />}
                            {sending ? 'กำลังส่งแจ้งเตือน...' : 'ส่งแจ้งเตือน (Send notification)'}
                        </button>
                    </div>
                </div>

                {/* Topics Target Column */}
                <div className="md:col-span-8 bg-white rounded border border-gray-200 shadow-sm">
                    <div className="px-5 py-4 border-b border-gray-200 bg-gray-50/50">
                        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-gray-500" />
                            หัวข้อรายงานที่ต้องการส่ง
                        </h2>
                    </div>

                    <div className="p-0">
                        <div
                            className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => toggleReport('progress')}
                        >
                            {selectedReports.progress ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">📌 ความคืบหน้าโครงการ (Project Progress)</h3>
                                <p className="text-xs text-gray-500">รายงานตัวเลขเปอร์เซ็นต์รวมและความคืบหน้าแบบรวดเร็ว</p>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => toggleReport('thisWeek')}
                        >
                            {selectedReports.thisWeek ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">📅 งานแผนสัปดาห์นี้ (This Week Tasks)</h3>
                                <p className="text-xs text-gray-500">รายงานรายการงานที่ต้องเริ่มหรือดำเนินการภายในสัปดาห์ปัจจุบัน (พร้อมประเมินสถานะ)</p>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => toggleReport('lastWeek')}
                        >
                            {selectedReports.lastWeek ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">⏮️ งานสัปดาห์ที่ผ่านมา (Last Week Tasks)</h3>
                                <p className="text-xs text-gray-500">สรุปงานสำคัญที่มีเดดไลน์หรืออยู่ในระยะดำเนินการของสัปดาห์ที่ผ่านมา</p>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-4 px-5 py-4 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => toggleReport('procurement')}
                        >
                            {selectedReports.procurement ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">⚠️ รายการที่ต้องจัดซื้อ (Procurement Alert)</h3>
                                <p className="text-xs text-gray-500">แจ้งเตือนเกี่ยวกับงานที่มีรายการวัสดุ-จัดซื้อรออยู่เพื่อให้ไม่กระทบแผนงานหลัก</p>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-4 px-5 py-4 hover:bg-gray-50 cursor-pointer transition-colors"
                            onClick={() => toggleReport('sCurve')}
                        >
                            {selectedReports.sCurve ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5 text-gray-300" />}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 mb-0.5">📈 รายงานประจำสัปดาห์กราฟแนวโน้ม (S-Curve & Budget Status)</h3>
                                <p className="text-xs text-gray-500">รายงานเจาะลึกที่แสดงตัวเลข Earned Value, Actual Cost, PV, และสรุปสถานะการเงินโครงการ</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
