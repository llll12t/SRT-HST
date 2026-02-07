import React from 'react';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import {
    Eye,
    EyeOff,
    FileDown,
    ChevronLeft,
    ChevronRight,
    Wallet,
    TrendingUp,
    Settings,
    Check,
    Link as LinkIcon,
    Calendar,
    Users,
    Maximize2,
    Minimize2
} from 'lucide-react';
import { ViewMode, DateRange, VisibleColumns } from './types';

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
    visibleColumns?: VisibleColumns;
    onToggleColumn?: (col: keyof VisibleColumns) => void;
    onToggleAllColumns?: (visible: boolean) => void;
    showDependencies: boolean;
    onToggleDependencies: () => void;
    customDate: Date | null;
    onCustomDateChange: (date: Date | null) => void;
    onBudgetChange?: (amount: number) => void;
    isExpanded?: boolean;
    onToggleExpand?: () => void;
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
    onToggleAllColumns,
    showDependencies,
    onToggleDependencies,
    customDate,
    onCustomDateChange,
    onBudgetChange,
    isExpanded = false,
    onToggleExpand
}: GanttToolbarProps) {
    const [isBudgetEditing, setIsBudgetEditing] = React.useState(false);
    const [budgetInput, setBudgetInput] = React.useState('');

    React.useEffect(() => {
        setBudgetInput(budgetStats.totalCost.toString());
    }, [budgetStats.totalCost]);

    const handleBudgetSubmit = () => {
        setIsBudgetEditing(false);
        if (onBudgetChange) {
            const val = parseFloat(budgetInput.replace(/,/g, ''));
            if (!isNaN(val)) onBudgetChange(val);
        }
    };
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
        <div className="flex flex-col sm:flex-row items-center justify-between px-6 py-4 border-b border-gray-200 bg-white gap-6 flex-shrink-0 z-[90]">
            {/* Left: Title & Project Info */}
            <div className="flex items-center gap-6 print-show min-w-0">
                <div className="flex flex-col">
                    <h3 className="font-bold text-gray-900 text-lg leading-tight tracking-tight truncate">{title || 'Project Master Schedule'}</h3>
                    <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        <span className="font-medium">
                            {format(timeRange.start, 'd MMM', { locale: th })} - {format(timeRange.end, 'd MMM yyyy', { locale: th })}
                        </span>
                    </div>
                </div>

                <div className="hidden lg:block w-px h-8 bg-gray-200"></div>

                {/* KPI / Stats Minimalist View */}
                <div className="hidden lg:flex items-center gap-6">
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Budget</span>
                        <div className="flex items-baseline gap-1" onDoubleClick={() => setIsBudgetEditing(true)}>
                            {isBudgetEditing ? (
                                <input
                                    autoFocus
                                    className="w-24 text-sm font-bold font-mono border-b border-blue-500 outline-none"
                                    value={budgetInput}
                                    onChange={(e) => setBudgetInput(e.target.value)}
                                    onBlur={handleBudgetSubmit}
                                    onKeyDown={(e) => { if (e.key === 'Enter') handleBudgetSubmit(); }}
                                />
                            ) : (
                                <span className="text-sm font-bold text-gray-900 font-mono hover:text-blue-600 cursor-pointer" title="Double click to edit">
                                    {budgetStats.totalCost.toLocaleString()}
                                </span>
                            )}
                            <span className="text-[10px] text-gray-500 font-medium">THB</span>
                        </div>
                    </div>
                    <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Progress</span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-sm font-bold font-mono ${progressStats.totalActual > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                {progressStats.totalActual.toFixed(1)}%
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 print-hide ml-auto">

                {/* View Mode Switcher - Segmented Control Style */}
                <div className="flex bg-gray-100/80 p-0.5 rounded-lg">
                    {(['day', 'week', 'month'] as ViewMode[]).map((mode) => (
                        <button key={mode} onClick={() => onViewModeChange(mode)}
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'
                                }`}>
                            {mode === 'day' ? 'วัน' : mode === 'week' ? 'สัปดาห์' : 'เดือน'}
                        </button>
                    ))}
                </div>

                <div className="w-px h-6 bg-gray-200 hidden sm:block"></div>

                {/* Navigation - Minimalist */}
                <div className="flex items-center gap-1">
                    <button onClick={() => onNavigate('prev')}
                        className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-md transition-colors"
                        title="Prior">
                        <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={onJumpToToday}
                        className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 border border-gray-200 rounded-md transition-colors bg-white">
                        วันนี้
                    </button>
                    <button onClick={() => onNavigate('next')}
                        className="p-1.5 hover:bg-gray-100 text-gray-500 rounded-md transition-colors"
                        title="Next">
                        <ChevronRight className="w-5 h-5" />
                    </button>
                </div>

                <div className="w-px h-6 bg-gray-200 hidden sm:block"></div>

                {/* Action Tools */}
                <div className="flex items-center gap-2">
                    <button onClick={onToggleDependencies}
                        title={showDependencies ? 'ซ่อนเส้นความสัมพันธ์' : 'แสดงเส้นความสัมพันธ์'}
                        className={`p-2 rounded-md transition-all ${showDependencies ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                        <LinkIcon className="w-4 h-4" />
                    </button>
                    {onToggleExpand && (
                        <button
                            onClick={onToggleExpand}
                            title={isExpanded ? 'ย่อขนาด' : 'ขยายเต็มจอ'}
                            className={`p-2 rounded-md transition-all ${isExpanded ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                        >
                            {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        </button>
                    )}

                    {onToggleAllColumns && visibleColumns && (
                        <button
                            onClick={() => {
                                const anyVisible = Object.values(visibleColumns).some(v => v);
                                onToggleAllColumns(!anyVisible);
                            }}
                            title={Object.values(visibleColumns).some(v => v) ? 'ซ่อนคอลัมน์ทั้งหมด' : 'แสดงคอลัมน์ทั้งหมด'}
                            className={`p-2 rounded-md transition-all ${Object.values(visibleColumns).every(v => !v) ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                        >
                            {Object.values(visibleColumns).some(v => v) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                    )}

                    <div className="relative column-menu-trigger">
                        <button
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            className={`p-2 rounded-md transition-all ${showColumnMenu ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                            title="ตั้งค่ามุมมอง"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {/* Column Menu Dropdown */}
                        {showColumnMenu && visibleColumns && onToggleColumn && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-2 flex flex-col text-left animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                <div className="px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/30">
                                    แสดงคอลัมน์
                                </div>
                                <div className="p-1">
                                    <button onClick={() => onToggleColumn('cost')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><Wallet className="w-4 h-4 text-gray-400" /> Cost (งบประมาณ)</span>
                                        {visibleColumns.cost && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                    <button onClick={() => onToggleColumn('weight')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">W</span> Weight (น้ำหนัก)</span>
                                        {visibleColumns.weight && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                    <button onClick={() => onToggleColumn('quantity')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">Q</span> Quantity (ปริมาณ)</span>
                                        {visibleColumns.quantity && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                    <button onClick={() => onToggleColumn('period')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><Calendar className="w-4 h-4 text-gray-400" /> Period (ระยะเวลา)</span>
                                        {visibleColumns.period && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                    {Object.prototype.hasOwnProperty.call(visibleColumns, 'planDuration') && (
                                        <button onClick={() => onToggleColumn('planDuration')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                            <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">P</span> แผน(วัน)</span>
                                            {visibleColumns.planDuration && <Check className="w-4 h-4 text-blue-600" />}
                                        </button>
                                    )}
                                    {Object.prototype.hasOwnProperty.call(visibleColumns, 'actualDuration') && (
                                        <button onClick={() => onToggleColumn('actualDuration')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                            <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">A</span> จริง(วัน)</span>
                                            {visibleColumns.actualDuration && <Check className="w-4 h-4 text-blue-600" />}
                                        </button>
                                    )}
                                    <button onClick={() => onToggleColumn('team')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><Users className="w-4 h-4 text-gray-400" /> พนักงาน (ทีม)</span>
                                        {visibleColumns.team && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                    <button onClick={() => onToggleColumn('progress')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                        <span className="flex items-center gap-3"><TrendingUp className="w-4 h-4 text-gray-400" /> Progress (%)</span>
                                        {visibleColumns.progress && <Check className="w-4 h-4 text-blue-600" />}
                                    </button>
                                </div>

                                {/* Reference Date Config */}
                                <div className="px-4 py-2 border-t border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/30 mt-1">
                                    วันอ้างอิง (REFERENCE DATE)
                                </div>
                                <div className="px-4 py-3 text-sm text-gray-700 space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer hover:text-blue-600 group">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${customDate === null ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}>
                                            {customDate === null && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <input
                                            type="radio"
                                            name="dateType"
                                            checked={customDate === null}
                                            onChange={() => onCustomDateChange(null)}
                                            className="hidden"
                                        />
                                        <span className="group-hover:translate-x-0.5 transition-transform">วันนี้ (System Today)</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer hover:text-blue-600 group">
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${customDate !== null ? 'border-blue-600 bg-blue-600' : 'border-gray-300 bg-white'}`}>
                                            {customDate !== null && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                                        </div>
                                        <input
                                            type="radio"
                                            name="dateType"
                                            checked={customDate !== null}
                                            onChange={() => onCustomDateChange(new Date())}
                                            className="hidden"
                                        />
                                        <span className="group-hover:translate-x-0.5 transition-transform">กำหนดเอง (Custom)</span>
                                    </label>
                                    {customDate && (
                                        <input
                                            type="date"
                                            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-gray-50"
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
                    {onExportPDF && (
                        <div className="h-6 w-px bg-gray-200 mx-2"></div>
                    )}

                    {onExportPDF && (
                        <button
                            onClick={onExportPDF}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-white bg-gray-900 hover:bg-gray-800 rounded-md transition-colors shadow-sm"
                            title="Export PDF"
                        >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>Export PDF</span>
                        </button>
                    )}
                </div>
            </div>
        </div >
    );
}


