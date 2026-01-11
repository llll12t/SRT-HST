'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
    FolderKanban,
    Plus,
    Search,
    MoreVertical,
    Calendar,
    Users,
    TrendingUp,
    Building2,
    MapPin,
    Clock,
    CheckCircle2,
    AlertCircle,
    X,
    Edit2,
    Trash2,
    Loader2
} from 'lucide-react';
import { Project } from '@/types/construction';
import { getProjects, createProject, updateProject, deleteProject } from '@/lib/firestore';

type StatusType = 'all' | 'planning' | 'in-progress' | 'completed' | 'on-hold';

export default function ProjectsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusType>('all');
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

    // Modal states
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingProject, setEditingProject] = useState<Project | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

    // Form state
    const [formData, setFormData] = useState({
        name: '',
        code: '',
        owner: '',
        location: '',
        description: '',
        startDate: '',
        endDate: '',
        manager: '',
        budget: 0,
        status: 'planning' as Project['status']
    });

    // Fetch projects
    useEffect(() => {
        fetchProjects();
    }, []);

    const fetchProjects = async () => {
        try {
            setLoading(true);
            const data = await getProjects();
            setProjects(data);
        } catch (error) {
            console.error('Error fetching projects:', error);
        } finally {
            setLoading(false);
        }
    };

    // Filter projects
    const filteredProjects = projects.filter(project => {
        const matchesSearch = project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (project.description || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = statusFilter === 'all' || project.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    // Stats
    const stats = {
        total: projects.length,
        inProgress: projects.filter(p => p.status === 'in-progress').length,
        completed: projects.filter(p => p.status === 'completed').length,
        planning: projects.filter(p => p.status === 'planning').length,
    };

    // Open modal for create
    const openCreateModal = () => {
        setEditingProject(null);
        setFormData({
            name: '',
            code: '',
            owner: '',
            location: '',
            description: '',
            startDate: new Date().toISOString().slice(0, 10),
            endDate: '',
            manager: '',
            budget: 0,
            status: 'planning'
        });
        setIsModalOpen(true);
    };

    // Open modal for edit
    const openEditModal = (project: Project) => {
        setEditingProject(project);
        setFormData({
            name: project.name,
            code: (project as any).code || '',
            owner: project.owner,
            location: (project as any).location || '',
            description: project.description || '',
            startDate: project.startDate,
            endDate: project.endDate,
            manager: (project as any).manager || '',
            budget: (project as any).budget || 0,
            status: project.status
        });
        setIsModalOpen(true);
    };

    // Handle form submit
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);

        try {
            if (editingProject) {
                // Update existing project
                await updateProject(editingProject.id, {
                    name: formData.name,
                    owner: formData.owner,
                    description: formData.description,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    status: formData.status,
                });
            } else {
                // Create new project
                await createProject({
                    name: formData.name,
                    owner: formData.owner,
                    description: formData.description,
                    startDate: formData.startDate,
                    endDate: formData.endDate,
                    overallProgress: 0,
                    status: formData.status,
                });
            }

            setIsModalOpen(false);
            fetchProjects();
        } catch (error) {
            console.error('Error saving project:', error);
            alert('เกิดข้อผิดพลาดในการบันทึก');
        } finally {
            setSaving(false);
        }
    };

    // Handle delete
    const handleDelete = async (projectId: string) => {
        try {
            await deleteProject(projectId);
            setDeleteConfirm(null);
            fetchProjects();
        } catch (error) {
            console.error('Error deleting project:', error);
            alert('เกิดข้อผิดพลาดในการลบ');
        }
    };

    // Status config
    const getStatusConfig = (status: string) => {
        const configs: Record<string, { label: string; class: string; icon: React.ReactNode }> = {
            'planning': { label: 'วางแผน', class: 'badge-neutral', icon: <Clock className="w-3 h-3" /> },
            'in-progress': { label: 'กำลังดำเนินการ', class: 'badge-info', icon: <TrendingUp className="w-3 h-3" /> },
            'completed': { label: 'เสร็จสิ้น', class: 'badge-success', icon: <CheckCircle2 className="w-3 h-3" /> },
            'on-hold': { label: 'ระงับชั่วคราว', class: 'badge-warning', icon: <AlertCircle className="w-3 h-3" /> },
        };
        return configs[status] || configs['planning'];
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-gray-900 flex items-center gap-2">
                        <FolderKanban className="w-6 h-6 text-blue-600" />
                        โครงการทั้งหมด
                    </h1>
                    <p className="text-gray-500 text-sm mt-0.5">จัดการและติดตามโครงการก่อสร้าง</p>
                </div>

                <button
                    onClick={openCreateModal}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    สร้างโครงการใหม่
                </button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">โครงการทั้งหมด</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">กำลังดำเนินการ</p>
                    <p className="text-2xl font-semibold text-blue-600 mt-1">{stats.inProgress}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">เสร็จสิ้น</p>
                    <p className="text-2xl font-semibold text-green-600 mt-1">{stats.completed}</p>
                </div>
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <p className="text-gray-500 text-xs font-medium">วางแผน</p>
                    <p className="text-2xl font-semibold text-gray-600 mt-1">{stats.planning}</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg border border-gray-200 p-4 flex flex-col lg:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="ค้นหาโครงการ..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                    />
                </div>

                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as StatusType)}
                    className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-500 transition-colors"
                >
                    <option value="all">ทุกสถานะ</option>
                    <option value="planning">วางแผน</option>
                    <option value="in-progress">กำลังดำเนินการ</option>
                    <option value="completed">เสร็จสิ้น</option>
                    <option value="on-hold">ระงับชั่วคราว</option>
                </select>

                <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg overflow-hidden">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`px-3 py-2 text-sm ${viewMode === 'grid' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Grid
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`px-3 py-2 text-sm border-l border-gray-200 ${viewMode === 'list' ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        List
                    </button>
                </div>
            </div>

            {/* Loading State */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <span className="ml-2 text-gray-500">กำลังโหลดข้อมูล...</span>
                </div>
            ) : filteredProjects.length === 0 ? (
                /* Empty State */
                <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                    <FolderKanban className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 mb-4">
                        {projects.length === 0 ? 'ยังไม่มีโครงการ' : 'ไม่พบโครงการที่ค้นหา'}
                    </p>
                    {projects.length === 0 && (
                        <button
                            onClick={openCreateModal}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            สร้างโครงการแรก
                        </button>
                    )}
                </div>
            ) : viewMode === 'grid' ? (
                /* Projects Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredProjects.map((project) => {
                        const statusConfig = getStatusConfig(project.status);
                        return (
                            <div
                                key={project.id}
                                className="bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-md transition-all group"
                            >
                                {/* Header */}
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                                            <Building2 className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="font-medium text-gray-900">{project.name}</h3>
                                            <p className="text-xs text-gray-400">{project.owner}</p>
                                        </div>
                                    </div>
                                    <div className="relative">
                                        <button
                                            onClick={() => setDeleteConfirm(deleteConfirm === project.id ? null : project.id)}
                                            className="p-1 hover:bg-gray-100 rounded text-gray-400"
                                        >
                                            <MoreVertical className="w-4 h-4" />
                                        </button>

                                        {/* Dropdown Menu */}
                                        {deleteConfirm === project.id && (
                                            <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-10 w-32">
                                                <button
                                                    onClick={() => { openEditModal(project); setDeleteConfirm(null); }}
                                                    className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                    แก้ไข
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(project.id)}
                                                    className="w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                    ลบ
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Description */}
                                {project.description && (
                                    <p className="text-sm text-gray-500 mb-3 line-clamp-2">{project.description}</p>
                                )}

                                {/* Progress */}
                                <div className="mb-4">
                                    <div className="flex items-center justify-between text-sm mb-1.5">
                                        <span className="text-gray-500">Progress</span>
                                        <span className={`font-medium ${project.overallProgress === 100 ? 'text-green-600' :
                                                project.overallProgress >= 50 ? 'text-blue-600' :
                                                    'text-gray-700'
                                            }`}>
                                            {project.overallProgress}%
                                        </span>
                                    </div>
                                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full rounded-full transition-all ${project.overallProgress === 100 ? 'bg-green-500' :
                                                    project.overallProgress >= 50 ? 'bg-blue-500' :
                                                        project.overallProgress > 0 ? 'bg-amber-500' :
                                                            'bg-gray-300'
                                                }`}
                                            style={{ width: `${project.overallProgress}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Meta Info */}
                                <div className="flex items-center gap-3 text-sm text-gray-500 mb-4">
                                    <div className="flex items-center gap-1.5">
                                        <Calendar className="w-3.5 h-3.5" />
                                        <span>{project.startDate}</span>
                                    </div>
                                    <span>→</span>
                                    <span>{project.endDate}</span>
                                </div>

                                {/* Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                                    <span className={`badge ${statusConfig.class} inline-flex items-center gap-1`}>
                                        {statusConfig.icon}
                                        {statusConfig.label}
                                    </span>
                                    <Link
                                        href={`/projects/${project.id}`}
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        รายละเอียด →
                                    </Link>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Projects List View */
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">โครงการ</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">เจ้าของ</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Progress</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">สถานะ</th>
                                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {filteredProjects.map((project) => {
                                const statusConfig = getStatusConfig(project.status);
                                return (
                                    <tr key={project.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <p className="text-sm font-medium text-gray-900">{project.name}</p>
                                            <p className="text-xs text-gray-400">{project.startDate} → {project.endDate}</p>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-gray-600">{project.owner}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2 justify-center">
                                                <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full ${project.overallProgress === 100 ? 'bg-green-500' :
                                                                project.overallProgress >= 50 ? 'bg-blue-500' :
                                                                    'bg-amber-500'
                                                            }`}
                                                        style={{ width: `${project.overallProgress}%` }}
                                                    />
                                                </div>
                                                <span className="text-sm font-medium text-gray-700">{project.overallProgress}%</span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 text-center">
                                            <span className={`badge ${statusConfig.class} inline-flex items-center gap-1`}>
                                                {statusConfig.icon}
                                                {statusConfig.label}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-center gap-1">
                                                <button
                                                    onClick={() => openEditModal(project)}
                                                    className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-blue-600 transition-colors"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(project.id)}
                                                    className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600 transition-colors"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
                            <h2 className="text-lg font-semibold text-gray-900">
                                {editingProject ? 'แก้ไขโครงการ' : 'สร้างโครงการใหม่'}
                            </h2>
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="p-1 hover:bg-gray-100 rounded text-gray-400"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อโครงการ *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="เช่น Entrance 1 Construction"
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">เจ้าของโครงการ *</label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.owner}
                                        onChange={(e) => setFormData({ ...formData, owner: e.target.value })}
                                        placeholder="เช่น SCCC"
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">สถานะ</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData({ ...formData, status: e.target.value as Project['status'] })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                                    >
                                        <option value="planning">วางแผน</option>
                                        <option value="in-progress">กำลังดำเนินการ</option>
                                        <option value="completed">เสร็จสิ้น</option>
                                        <option value="on-hold">ระงับชั่วคราว</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1.5">รายละเอียด</label>
                                <textarea
                                    rows={3}
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="รายละเอียดโครงการ..."
                                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors resize-none"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">วันเริ่มต้น *</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.startDate}
                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1.5">วันสิ้นสุด *</label>
                                    <input
                                        type="date"
                                        required
                                        value={formData.endDate}
                                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:border-blue-500 transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-200">
                                <button
                                    type="button"
                                    onClick={() => setIsModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                                >
                                    {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                    {editingProject ? 'บันทึก' : 'สร้างโครงการ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
