'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Briefcase,
    Loader2,
    Mail,
    Phone,
    Plus,
    Trash2,
    UserPlus,
    Users
} from 'lucide-react';
import { Employee } from '@/types/construction';
import { createEmployee, deleteEmployee, getEmployees } from '@/lib/firestore';
import { useAuth } from '@/contexts/AuthContext';

interface EmployeeForm {
    name: string;
    employeeCode: string;
    position: string;
    department: string;
    email: string;
    phone: string;
    avatarBase64: string;
}

const defaultForm: EmployeeForm = {
    name: '',
    employeeCode: '',
    position: '',
    department: '',
    email: '',
    phone: '',
    avatarBase64: ''
};

export default function EmployeesPage() {
    const { user } = useAuth();
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [form, setForm] = useState<EmployeeForm>(defaultForm);
    const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

    const canManage = useMemo(() => {
        return user?.role === 'admin' || user?.role === 'project_manager';
    }, [user]);

    const fetchEmployees = async () => {
        try {
            setLoading(true);
            const data = await getEmployees();
            setEmployees(data);
        } catch (error) {
            console.error('Error fetching employees:', error);
            alert('ไม่สามารถโหลดข้อมูลพนักงานได้');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchEmployees();
    }, []);

    const handleChange = (field: keyof EmployeeForm, value: string) => {
        setForm(prev => ({ ...prev, [field]: value }));
    };

    const MAX_BASE64_BYTES = 900_000;

    const getBase64ByteSize = (dataUrl: string) => {
        return new Blob([dataUrl]).size;
    };

    const compressImageToBase64 = async (file: File): Promise<string> => {
        const imageUrl = URL.createObjectURL(file);
        try {
            const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error('ไม่สามารถโหลดรูปภาพได้'));
                img.src = imageUrl;
            });

            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('ไม่สามารถประมวลผลรูปภาพได้');

            const maxSides = [640, 512, 384, 320, 256];
            const qualities = [0.82, 0.72, 0.62, 0.52, 0.42];

            for (const maxSide of maxSides) {
                const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
                const width = Math.max(1, Math.round(image.width * scale));
                const height = Math.max(1, Math.round(image.height * scale));

                canvas.width = width;
                canvas.height = height;
                ctx.clearRect(0, 0, width, height);
                ctx.drawImage(image, 0, 0, width, height);

                for (const quality of qualities) {
                    const base64 = canvas.toDataURL('image/jpeg', quality);
                    if (getBase64ByteSize(base64) <= MAX_BASE64_BYTES) {
                        return base64;
                    }
                }
            }

            throw new Error('รูปภาพมีขนาดใหญ่เกินไปหลังบีบอัด');
        } finally {
            URL.revokeObjectURL(imageUrl);
        }
    };

    const handleImageChange = async (file?: File) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น');
            return;
        }
        if (file.size > 8 * 1024 * 1024) {
            alert('ขนาดไฟล์ต้นฉบับต้องไม่เกิน 8MB');
            return;
        }

        try {
            const compressedBase64 = await compressImageToBase64(file);
            setForm(prev => ({ ...prev, avatarBase64: compressedBase64 }));
        } catch (error) {
            console.error('Image compression error:', error);
            alert('ไม่สามารถบีบอัดรูปภาพให้อยู่ในขนาดที่บันทึกได้');
        }
    };

    const validateAvatarSize = () => {
        if (!form.avatarBase64) return true;
        const bytes = getBase64ByteSize(form.avatarBase64);
        if (bytes > MAX_BASE64_BYTES) {
            alert('รูปภาพยังมีขนาดใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง');
            return false;
        }
        return true;
    };

    const resetForm = () => setForm(defaultForm);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canManage) return;

        if (!form.name.trim()) {
            alert('กรุณากรอกชื่อพนักงาน');
            return;
        }

        if (!validateAvatarSize()) {
            return;
        }

        if (form.employeeCode.trim()) {
            const duplicateCode = employees.some(
                employee => (employee.employeeCode || '').trim().toLowerCase() === form.employeeCode.trim().toLowerCase()
            );
            if (duplicateCode) {
                alert('รหัสพนักงานนี้มีอยู่แล้ว');
                return;
            }
        }

        try {
            setSaving(true);
            await createEmployee({
                name: form.name.trim(),
                employeeCode: form.employeeCode.trim() || undefined,
                position: form.position.trim() || undefined,
                department: form.department.trim() || undefined,
                email: form.email.trim().toLowerCase() || undefined,
                phone: form.phone.trim() || undefined,
                avatarBase64: form.avatarBase64 || undefined,
                active: true
            });
            resetForm();
            await fetchEmployees();
        } catch (error) {
            console.error('Error creating employee:', error);
            alert('ไม่สามารถบันทึกข้อมูลพนักงานได้');
        } finally {
            setSaving(false);
        }
    };

    const handleRequestDelete = (employeeId: string) => {
        if (!canManage) return;

        const target = employees.find(employee => employee.id === employeeId);
        if (!target) return;
        setDeleteTarget(target);
    };

    const handleConfirmDelete = async () => {
        if (!canManage || !deleteTarget) return;

        try {
            setDeleting(true);
            await deleteEmployee(deleteTarget.id);
            await fetchEmployees();
            setDeleteTarget(null);
        } catch (error) {
            console.error('Error deleting employee:', error);
            alert('ไม่สามารถลบพนักงานได้');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <Users className="w-6 h-6 text-blue-600" />
                        ข้อมูลพนักงาน
                    </h1>
                    <p className="text-sm text-gray-500 mt-1">ใช้สำหรับมอบหมายผู้รับผิดชอบงาน</p>
                </div>
                <div className="px-3 py-2 rounded-sm bg-blue-50 text-blue-700 text-sm font-medium">
                    ทั้งหมด: {employees.length} คน
                </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <div className="xl:col-span-1 bg-white border border-gray-300 rounded-sm p-5">
                    <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-blue-600" />
                        เพิ่มพนักงาน
                    </h2>

                    <form className="mt-4 space-y-3" onSubmit={handleCreate}>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">ชื่อ-นามสกุล *</label>
                            <input
                                value={form.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="เช่น สมชาย ใจดี"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">รหัสพนักงาน</label>
                            <input
                                value={form.employeeCode}
                                onChange={(e) => handleChange('employeeCode', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="เช่น EMP-001"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">ตำแหน่ง</label>
                            <input
                                value={form.position}
                                onChange={(e) => handleChange('position', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="เช่น วิศวกรสนาม"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">แผนก</label>
                            <input
                                value={form.department}
                                onChange={(e) => handleChange('department', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="เช่น ก่อสร้าง"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">อีเมล</label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => handleChange('email', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="example@company.com"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">เบอร์โทร</label>
                            <input
                                value={form.phone}
                                onChange={(e) => handleChange('phone', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                placeholder="08x-xxx-xxxx"
                                disabled={!canManage || saving}
                            />
                        </div>
                        <div>
                            <label className="block text-sm text-gray-700 mb-1">รูปพนักงาน (Base64)</label>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleImageChange(e.target.files?.[0])}
                                className="w-full px-3 py-2 border border-gray-300 rounded-sm text-sm outline-none file:mr-3 file:px-3 file:py-1 file:border-0 file:bg-blue-50 file:text-blue-700 file:rounded-md"
                                disabled={!canManage || saving}
                            />
                            {form.avatarBase64 && (
                                <div className="mt-2 flex items-center gap-3">
                                    <img
                                        src={form.avatarBase64}
                                        alt="ตัวอย่างรูปพนักงาน"
                                        className="w-12 h-12 rounded-full object-cover border border-gray-300"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleChange('avatarBase64', '')}
                                        className="text-xs text-red-600 hover:underline"
                                    >
                                        ลบรูป
                                    </button>
                                </div>
                            )}
                        </div>

                        <button
                            type="submit"
                            disabled={!canManage || saving}
                            className="w-full mt-2 px-4 py-2.5 rounded-sm bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                            บันทึกพนักงาน
                        </button>

                        {!canManage && (
                            <p className="text-xs text-amber-600">
                                คุณไม่มีสิทธิ์เพิ่มหรือลบข้อมูลพนักงาน
                            </p>
                        )}
                    </form>
                </div>

                <div className="xl:col-span-2 bg-white border border-gray-300 rounded-sm p-5">
                    <h2 className="text-base font-semibold text-gray-900 mb-4">รายชื่อพนักงาน</h2>

                    {loading ? (
                        <div className="py-12 text-center text-gray-500">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600" />
                            กำลังโหลดข้อมูลพนักงาน...
                        </div>
                    ) : employees.length === 0 ? (
                        <div className="py-12 text-center text-gray-500">
                            <Briefcase className="w-10 h-10 mx-auto mb-3 text-gray-300" />
                            ยังไม่มีข้อมูลพนักงาน
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-gray-300 text-gray-600">
                                        <th className="text-left px-3 py-2 font-medium">รูป</th>
                                        <th className="text-left px-3 py-2 font-medium">ชื่อ</th>
                                        <th className="text-left px-3 py-2 font-medium">ตำแหน่ง</th>
                                        <th className="text-left px-3 py-2 font-medium">ติดต่อ</th>
                                        <th className="text-left px-3 py-2 font-medium">แผนก</th>
                                        <th className="text-right px-3 py-2 font-medium">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {employees.map((employee) => (
                                        <tr key={employee.id} className="border-b border-gray-100 hover:bg-gray-50">
                                            <td className="px-3 py-2.5">
                                                {employee.avatarBase64 ? (
                                                    <img
                                                        src={employee.avatarBase64}
                                                        alt={employee.name}
                                                        className="w-10 h-10 rounded-full object-cover border border-gray-300"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-300 flex items-center justify-center text-gray-400 text-xs">
                                                        N/A
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-3 py-2.5">
                                                <p className="font-medium text-gray-900">{employee.name}</p>
                                                {employee.employeeCode && <p className="text-xs text-gray-500">รหัส: {employee.employeeCode}</p>}
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-700">{employee.position || '-'}</td>
                                            <td className="px-3 py-2.5">
                                                <div className="space-y-1">
                                                    {employee.email && (
                                                        <p className="text-gray-700 inline-flex items-center gap-1.5">
                                                            <Mail className="w-3.5 h-3.5 text-gray-400" />
                                                            {employee.email}
                                                        </p>
                                                    )}
                                                    {employee.phone && (
                                                        <p className="text-gray-600 inline-flex items-center gap-1.5">
                                                            <Phone className="w-3.5 h-3.5 text-gray-400" />
                                                            {employee.phone}
                                                        </p>
                                                    )}
                                                    {!employee.email && !employee.phone && <span className="text-gray-400">-</span>}
                                                </div>
                                            </td>
                                            <td className="px-3 py-2.5 text-gray-700">{employee.department || '-'}</td>
                                            <td className="px-3 py-2.5 text-right">
                                                <button
                                                    onClick={() => handleRequestDelete(employee.id)}
                                                    disabled={!canManage}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    ลบ
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            {deleteTarget && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
                    <div className="w-full max-w-md bg-white border border-gray-300 rounded-sm shadow-sm">
                        <div className="px-5 py-4 border-b border-gray-200 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-red-500" />
                            <h3 className="text-base font-semibold text-gray-900">ยืนยันการลบพนักงาน</h3>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-gray-700">
                                ต้องการลบพนักงาน <span className="font-semibold">{deleteTarget.name}</span> หรือไม่?
                            </p>
                        </div>
                        <div className="px-5 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setDeleteTarget(null)}
                                disabled={deleting}
                                className="px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-sm hover:bg-gray-200 disabled:opacity-50"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleConfirmDelete}
                                disabled={deleting}
                                className="px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-sm hover:bg-red-700 disabled:opacity-50 inline-flex items-center gap-2"
                            >
                                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                                ลบ
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
