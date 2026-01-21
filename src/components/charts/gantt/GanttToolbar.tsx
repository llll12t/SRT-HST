import React from 'react';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import {
    SlidersHorizontal,
    Eye,
    EyeOff,
    Download,
    FileDown,
    ChevronLeft,
    ChevronRight,
    Wallet,
    TrendingUp,
    Settings,
    Check,
    Link as LinkIcon
} from 'lucide-react';
import { ViewMode, DateRange } from './types';

interface GanttToolbarProps {
    title?: string;
    timeRange: DateRange;
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    showDates: boolean;
    onToggleDates: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
    onJumpToToday: () => void;
    onExport: () => void;
    onExportPDF?: () => void;
    budgetStats: {
        totalCost: number;
        totalDuration: number;
        useCostWeighting: boolean;
        totalWeight: number;
    };
    progressStats: {
        totalActual: number;
        totalPlan: number;
    };
    visibleColumns?: {
        cost: boolean;
        weight: boolean;
        quantity: boolean;
        period: boolean;
        progress: boolean;
    };
    onToggleColumn?: (col: string) => void;
    showDependencies: boolean;
    onToggleDependencies: () => void;
    customDate: Date | null;
    onCustomDateChange: (date: Date | null) => void;
}

export default function GanttToolbar({
    title,
    timeRange,
    viewMode,
    onViewModeChange,
    showDates,
    onToggleDates,
    onNavigate,
    onJumpToToday,
    onExport,
    onExportPDF,
    budgetStats,
    progressStats,
    visibleColumns,
    onToggleColumn,
    showDependencies,
    onToggleDependencies,
    customDate,
    onCustomDateChange
}: GanttToolbarProps) {
    const [showColumnMenu, setShowColumnMenu] = React.useState(false);

    // Close menu when clicking outside (simple handling)
    React.useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (showColumnMenu && !(e.target as Element).closest('.column-menu-trigger')) {
                setShowColumnMenu(false);
            }
        };
        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, [showColumnMenu]);
    return (
        <div className="flex flex-col sm:flex-row items-center justify-between p-3 border-b border-gray-200 bg-white gap-4 flex-shrink-0">
            <div className="flex items-center gap-3 print-show">
                <div className="p-1.5 bg-gray-100 text-gray-700 rounded-sm border border-gray-200 print-hide">
                    <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-800 text-sm">{title || 'Project Schedule'}</h3>
                    <p className="text-xs text-blue-600 font-bold font-mono">
                        {format(timeRange.start, 'd MMM yyyy', { locale: th })} - {format(timeRange.end, 'd MMM yyyy', { locale: th })}
                    </p>
                </div>
            </div>

            {/* Budget Summary */}
            <div className="flex items-center gap-4 px-3 py-1.5 bg-white rounded-sm border border-gray-300 print-hide">
                <div className="flex items-center gap-2">
                    <Wallet className="w-3.5 h-3.5 text-gray-600" />
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Budget</p>
                        <p className="text-xs font-bold text-gray-900">{budgetStats.totalCost.toLocaleString()} <span className="text-[10px] font-normal text-gray-500">THB</span></p>
                    </div>
                </div>
                <div className="w-px h-6 bg-gray-200"></div>
                <div className="flex items-center gap-2">
                    <TrendingUp className="w-3.5 h-3.5 text-gray-600" />
                    <div>
                        <p className="text-[10px] text-gray-500 uppercase font-semibold tracking-wider">Actual</p>
                        <p className="text-xs font-bold text-gray-900">{progressStats.totalActual.toFixed(2)}%</p>
                    </div>
                </div>
            </div>

            <div className="flex items-center gap-1 bg-gray-100 p-0.5 rounded-sm border border-gray-200 print-hide">
                {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                    <button key={mode} onClick={() => onViewModeChange(mode)}
                        className={`px-3 py-1 text-[11px] font-medium rounded-[2px] transition-all capitalize ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm border border-gray-200' : 'text-gray-500 hover:text-gray-900'
                            }`}>
                        {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน'}
                    </button>
                ))}
            </div>

            <div className="flex items-center gap-1 print-hide">
                <button onClick={onToggleDependencies}
                    title={showDependencies ? 'ซ่อนเส้นความสัมพันธ์' : 'แสดงเส้นความสัมพันธ์'}
                    className={`p-1.5 rounded-sm border transition-colors ${showDependencies ? 'bg-gray-100 border-gray-300 text-blue-600' : 'bg-white border-gray-300 text-gray-500'}`}>
                    <LinkIcon className="w-4 h-4" />
                </button>
                <button onClick={() => {
                    // Toggle all columns visibility at once
                    if (onToggleColumn && visibleColumns) {
                        const allVisible = visibleColumns.cost && visibleColumns.weight && visibleColumns.quantity && visibleColumns.period && visibleColumns.progress;
                        if (allVisible) {
                            // Hide all columns
                            onToggleColumn('cost');
                            onToggleColumn('weight');
                            onToggleColumn('quantity');
                            onToggleColumn('period');
                            onToggleColumn('progress');
                        } else {
                            // Show all columns
                            if (!visibleColumns.cost) onToggleColumn('cost');
                            if (!visibleColumns.weight) onToggleColumn('weight');
                            if (!visibleColumns.quantity) onToggleColumn('quantity');
                            if (!visibleColumns.period) onToggleColumn('period');
                            if (!visibleColumns.progress) onToggleColumn('progress');
                        }
                    }
                }}
                    title="แสดง/ซ่อน คอลัมน์ทั้งหมด"
                    className={`p-1.5 rounded-sm border transition-colors ${(visibleColumns?.cost || visibleColumns?.weight || visibleColumns?.quantity || visibleColumns?.period || visibleColumns?.progress) ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-300 text-gray-500'}`}>
                    {(visibleColumns?.cost || visibleColumns?.weight || visibleColumns?.quantity || visibleColumns?.period || visibleColumns?.progress) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <div className="relative column-menu-trigger">
                    <button
                        onClick={() => setShowColumnMenu(!showColumnMenu)}
                        className={`p-1.5 rounded-sm border transition-colors ${showColumnMenu ? 'bg-gray-100 border-gray-300 text-gray-800' : 'bg-white border-gray-300 text-gray-500'}`}
                        title="Column View Settings"
                    >
                        <Settings className="w-4 h-4" />
                    </button>
                    {showColumnMenu && visibleColumns && onToggleColumn && (
                        <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-200 rounded-sm shadow-xl z-50 py-1 flex flex-col text-left">
                            <div className="px-3 py-2 border-b border-gray-100 text-xs font-bold text-gray-900 bg-gray-50">
                                Show/Hide Columns
                            </div>
                            <button onClick={() => onToggleColumn('cost')} className="px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                <span>Cost (งบประมาณ)</span>
                                {visibleColumns.cost && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                            <button onClick={() => onToggleColumn('weight')} className="px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                <span>Weight (น้ำหนัก)</span>
                                {visibleColumns.weight && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                            <button onClick={() => onToggleColumn('quantity')} className="px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                <span>Quantity (ปริมาณ)</span>
                                {visibleColumns.quantity && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                            <button onClick={() => onToggleColumn('period')} className="px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                <span>Period (ระยะเวลา)</span>
                                {visibleColumns.period && <Check className="w-3 h-3 text-blue-600" />}
                            </button>
                            <button onClick={() => onToggleColumn('progress')} className="px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                                <span>Progress (%)</span>
                                {visibleColumns.progress && <Check className="w-3 h-3 text-blue-600" />}
                            </button>

                            {/* Reference Date Config */}
                            <div className="px-3 py-2 border-t border-b border-gray-100 text-xs font-bold text-gray-900 bg-gray-50">
                                Reference Date (วันอ้างอิง)
                            </div>
                            <div className="px-3 py-2 text-xs text-gray-700">
                                <label className="flex items-center gap-2 mb-2 cursor-pointer hover:text-blue-600">
                                    <input
                                        type="radio"
                                        name="dateType"
                                        checked={customDate === null}
                                        onChange={() => onCustomDateChange(null)}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>System Today (ปัจจุบัน)</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer hover:text-blue-600">
                                    <input
                                        type="radio"
                                        name="dateType"
                                        checked={customDate !== null}
                                        onChange={() => onCustomDateChange(new Date())}
                                        className="text-blue-600 focus:ring-blue-500"
                                    />
                                    <span>Custom Date (กำหนดเอง)</span>
                                </label>
                                {customDate && (
                                    <input
                                        type="date"
                                        className="mt-2 w-full border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        value={format(customDate, 'yyyy-MM-dd')}
                                        onChange={(e) => {
                                            if (e.target.value) onCustomDateChange(parseISO(e.target.value));
                                        }}
                                    />
                                )}
                            </div>
                        </div>
                    )}
                </div>
                <div className="h-5 w-px bg-gray-300 mx-1"></div>
                <button onClick={() => onNavigate('prev')} className="p-1.5 hover:bg-gray-50 rounded-sm text-gray-600 border border-gray-300">
                    <ChevronLeft className="w-4 h-4" />
                </button>
                <button onClick={onJumpToToday} className="px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 rounded-sm border border-gray-300">
                    วันนี้
                </button>
                <button onClick={() => onNavigate('next')} className="p-1.5 hover:bg-gray-50 rounded-sm text-gray-600 border border-gray-300">
                    <ChevronRight className="w-4 h-4" />
                </button>
                <div className="h-5 w-px bg-gray-300 mx-1"></div>
                {onExportPDF && (
                    <button
                        onClick={onExportPDF}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-sm flex items-center gap-1.5 transition-colors"
                        title="Export PDF"
                    >
                        <FileDown className="w-4 h-4" />
                        PDF
                    </button>
                )}
            </div>
        </div >
    );
}
