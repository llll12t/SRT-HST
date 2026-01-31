import React, { useState, useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { Task } from '@/types/construction';

interface ProgressUpdateModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | undefined;
    onUpdate: (taskId: string, newProgress: number, updateDate: string, reason: string) => Promise<void>;
}

export default function ProgressUpdateModal({
    isOpen,
    onClose,
    task,
    onUpdate
}: ProgressUpdateModalProps) {

    const [loading, setLoading] = useState(false);
    const [progressUpdate, setProgressUpdate] = useState({
        newProgress: 0,
        updateDate: new Date().toISOString().split('T')[0],
        reason: ''
    });

    // Initialize state when task changes or modal opens
    useEffect(() => {
        if (isOpen && task) {
            setProgressUpdate({
                newProgress: task.progress || 0,
                updateDate: task.progressUpdatedAt || new Date().toISOString().split('T')[0],
                reason: ''
            });
        }
    }, [isOpen, task]);

    const handleSubmit = async () => {
        if (!task) return;
        setLoading(true);
        try {
            await onUpdate(task.id, progressUpdate.newProgress, progressUpdate.updateDate, progressUpdate.reason);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen || !task) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[200] p-4">
            <div className="bg-white rounded-sm w-full max-w-md shadow-none border border-gray-400">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-900">
                        อัปเดทความคืบหน้า
                    </h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-100 rounded-sm text-gray-400"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    {/* Task Name */}
                    <div className="bg-gray-50 rounded-sm p-3 border border-gray-200">
                        <p className="text-xs text-gray-500">งาน</p>
                        <p className="text-sm font-medium text-gray-900 mt-0.5">{task.name}</p>
                    </div>

                    {/* Progress Change */}
                    <div className="flex items-center justify-center gap-4 py-3">
                        <div className="text-center">
                            <p className="text-2xl font-bold text-gray-400">{task.progress || 0}%</p>
                            <p className="text-xs text-gray-500">ปัจจุบัน</p>
                        </div>
                        <div className="text-2xl text-gray-300">→</div>
                        <div className="text-center">
                            <p className={`text-2xl font-bold ${progressUpdate.newProgress === 100 ? 'text-green-600' : progressUpdate.newProgress === -1 ? 'text-amber-500' : 'text-blue-600'}`}>
                                {progressUpdate.newProgress === -1 ? 'เริ่มงาน' : `${progressUpdate.newProgress}%`}
                            </p>
                            <p className="text-xs text-gray-500">ใหม่</p>
                        </div>
                    </div>

                    {/* Progress Selection Buttons */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">ระบุความคืบหน้า (%)</label>
                        <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-3">
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={progressUpdate.newProgress === -1 ? 0 : progressUpdate.newProgress}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (!isNaN(val)) {
                                            setProgressUpdate({ ...progressUpdate, newProgress: Math.min(100, Math.max(0, val)) });
                                        }
                                    }}
                                    className="w-24 px-3 py-2 text-center text-lg font-bold border border-gray-300 rounded-sm focus:border-blue-500 outline-none"
                                />
                                <div className="flex-1 flex gap-2 flex-wrap">
                                    {[0, 25, 50, 75, 100].map((val) => (
                                        <button
                                            key={val}
                                            type="button"
                                            onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: val })}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-sm border transition-colors ${progressUpdate.newProgress === val
                                                ? 'bg-blue-600 text-white border-blue-600'
                                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                                }`}
                                        >
                                            {val === 0 ? 'Reset' : `${val}%`}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => setProgressUpdate({ ...progressUpdate, newProgress: -1 })}
                                className={`w-full py-2 text-sm font-medium rounded-sm border border-dashed transition-colors flex items-center justify-center gap-2 ${progressUpdate.newProgress === -1
                                    ? 'bg-amber-50 text-amber-600 border-amber-300'
                                    : 'bg-gray-50 text-gray-500 border-gray-300 hover:bg-gray-100'
                                    }`}
                            >
                                🚩 เริ่มงาน (Start Work Only)
                            </button>
                        </div>
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            วันที่อัปเดท *
                        </label>
                        <input
                            type="date"
                            value={progressUpdate.updateDate}
                            onChange={(e) => setProgressUpdate({ ...progressUpdate, updateDate: e.target.value })}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black"
                        />
                    </div>

                    {/* Reason */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            เหตุผล / หมายเหตุ
                        </label>
                        <textarea
                            value={progressUpdate.reason}
                            onChange={(e) => setProgressUpdate({ ...progressUpdate, reason: e.target.value })}
                            placeholder="ระบุสาเหตุ (ถ้ามี) เช่น ฝนตกหนัก, รอวัสดุ"
                            rows={2}
                            className="w-full px-3 py-2 bg-white border border-gray-300 rounded-sm text-sm focus:border-black resize-none"
                        />
                    </div>

                    <div className="flex gap-3 pt-3">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-sm hover:bg-gray-200"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={loading}
                            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                            บันทึก
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
