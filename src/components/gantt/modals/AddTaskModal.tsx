import React, { useState, useEffect } from 'react';
import { Loader2, Save, X } from 'lucide-react';
import { format, addDays, parseISO } from 'date-fns';
import { Task } from '@/types/construction';

interface AddTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (taskData: any, autoLink: boolean) => Promise<void>;
    existingCategories: string[];
    tasks: Task[];
    initialData?: {
        parentTaskId?: string;
        category?: string;
        subcategory?: string;
        subsubcategory?: string;
        planStartDate?: string;
        type?: string;
    };
}

export default function AddTaskModal({
    isOpen,
    onClose,
    onSave,
    existingCategories,
    tasks,
    initialData
}: AddTaskModalProps) {

    // Internal State
    const [loading, setLoading] = useState(false);
    const [autoLink, setAutoLink] = useState(true);
    const [newTask, setNewTask] = useState({
        name: '',
        category: '',
        subcategory: '',
        subsubcategory: '',
        type: 'task',
        planStartDate: format(new Date(), 'yyyy-MM-dd'),
        duration: '1',
        cost: '',
        quantity: '',
        responsible: '',
        parentTaskId: '',
        color: '#3b82f6'
    });

    // Reset or Initialize state when opened
    useEffect(() => {
        if (isOpen) {
            setNewTask({
                name: '',
                category: initialData?.category || '',
                subcategory: initialData?.subcategory || '',
                subsubcategory: initialData?.subsubcategory || '',
                type: initialData?.type || 'task',
                planStartDate: initialData?.planStartDate || format(new Date(), 'yyyy-MM-dd'),
                duration: '1',
                cost: '',
                quantity: '',
                responsible: '',
                parentTaskId: initialData?.parentTaskId || '',
                color: '#3b82f6'
            });
            setAutoLink(true);
        }
    }, [isOpen, initialData]);

    // Calculate end date display
    const calculatedEndDate = (() => {
        if (!newTask.planStartDate) return null;
        const startDate = parseISO(newTask.planStartDate);
        if (isNaN(startDate.getTime())) return null;

        try {
            const days = Math.max(1, parseInt(newTask.duration) || 1);
            return addDays(startDate, days - 1);
        } catch {
            return startDate;
        }
    })();

    const displayEndDate = calculatedEndDate ? format(calculatedEndDate, 'dd/MM/yyyy') : '-';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            await onSave(newTask, autoLink);
            // Don't close here, parent handles it or we close after success
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4">
            <div className="bg-white rounded-sm border border-gray-300 w-full max-w-lg shadow-none">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50/50">
                    <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">เพิ่มงานใหม่</h2>
                    <button
                        onClick={onClose}
                        className="p-1 hover:bg-gray-200 rounded-sm transition-colors text-gray-500"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {/* Parent Group Indicator */}
                    {newTask.parentTaskId && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded-sm flex items-center gap-2">
                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                                อยู่ภายใต้
                            </span>
                            <span className="text-sm font-medium text-blue-800">
                                {tasks.find(t => t.id === newTask.parentTaskId)?.name || 'Unknown'}
                            </span>
                        </div>
                    )}

                    {/* Category & Subcategory - Compact Grid */}
                    <div className="grid grid-cols-3 gap-3 p-3 bg-gray-50/50 rounded-sm border border-gray-100">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                หมวดหมู่ <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                required
                                value={newTask.category}
                                onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                                placeholder="งานโครงสร้าง"
                                list="category-suggestions"
                                disabled={!!newTask.parentTaskId}
                                className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                            />
                            <datalist id="category-suggestions">
                                {existingCategories.map(cat => (
                                    <option key={cat} value={cat} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                หมวดหมู่ย่อย
                            </label>
                            <input
                                type="text"
                                value={newTask.subcategory}
                                onChange={(e) => setNewTask({ ...newTask, subcategory: e.target.value })}
                                placeholder="ระบุ (ถ้ามี)"
                                list="subcategory-suggestions"
                                disabled={!!newTask.parentTaskId}
                                className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                            />
                            <datalist id="subcategory-suggestions">
                                {[...new Set(tasks.map(t => t.subcategory).filter(Boolean))].map(sub => (
                                    <option key={sub} value={sub} />
                                ))}
                            </datalist>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                หมวดหมู่ย่อย 2
                            </label>
                            <input
                                type="text"
                                value={newTask.subsubcategory}
                                onChange={(e) => setNewTask({ ...newTask, subsubcategory: e.target.value })}
                                placeholder="ระบุ (ถ้ามี)"
                                disabled={!!newTask.parentTaskId}
                                className={`w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none ${newTask.parentTaskId ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                            />
                        </div>
                    </div>

                    {/* Name */}
                    <div>
                        <label className="block text-[11px] font-bold text-gray-700 uppercase tracking-wide mb-1">
                            ชื่อกิจกรรม / งาน <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            required
                            value={newTask.name}
                            onChange={(e) => setNewTask(prev => ({ ...prev, name: e.target.value }))}
                            placeholder="เช่น งานขุดดินฐานราก"
                            className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-medium"
                        />
                    </div>

                    {/* Date Range */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                วันเริ่มต้น
                            </label>
                            <input
                                type="date"
                                value={newTask.planStartDate}
                                onChange={(e) => setNewTask(prev => ({ ...prev, planStartDate: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                ระยะเวลา (วัน)
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={newTask.duration}
                                onChange={(e) => setNewTask(prev => ({ ...prev, duration: e.target.value }))}
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono text-center font-bold text-blue-600"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                วันสิ้นสุด
                            </label>
                            <div className="w-full px-2 py-1.5 border border-gray-200 bg-gray-50 rounded-sm text-xs text-gray-700 font-mono">
                                {displayEndDate}
                            </div>
                        </div>
                    </div>

                    {/* Resources & Cost */}
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                งบประมาณ (บาท)
                            </label>
                            <input
                                type="number"
                                value={newTask.cost || ''}
                                onChange={(e) => setNewTask(prev => ({ ...prev, cost: e.target.value }))}
                                placeholder="0"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                ปริมาณ
                            </label>
                            <input
                                type="text"
                                value={newTask.quantity || ''}
                                onChange={(e) => setNewTask(prev => ({ ...prev, quantity: e.target.value }))}
                                placeholder="เช่น 20 ตร.ม."
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-1">
                                ผู้รับผิดชอบ
                            </label>
                            <input
                                type="text"
                                value={newTask.responsible || ''}
                                onChange={(e) => setNewTask(prev => ({ ...prev, responsible: e.target.value }))}
                                placeholder="ระบุชื่อ"
                                className="w-full px-2 py-1.5 border border-gray-300 rounded-sm text-xs focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Auto Link Checkbox */}
                    <div className="flex items-center gap-2 pt-1">
                        <input
                            type="checkbox"
                            id="autoLink"
                            checked={autoLink}
                            onChange={(e) => setAutoLink(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                        />
                        <label htmlFor="autoLink" className="text-xs font-medium text-gray-600 cursor-pointer user-select-none">
                            เชื่อมต่องานอัตโนมุติ (Auto-connect to previous task)
                        </label>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-sm transition-colors"
                        >
                            ยกเลิก
                        </button>
                        <button
                            type="submit"
                            disabled={loading || !newTask.name || !newTask.category || !newTask.planStartDate}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-sm hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    กำลังบันทึก...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    บันทึก
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
