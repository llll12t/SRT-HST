import React from 'react';
import { format, parseISO } from 'date-fns';
import { enUS } from 'date-fns/locale';
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
    kpiStats: {
        progress: number;
        planToDate: number;
        gap: number;
        varianceDays: number | null;
        variancePercent: number | null;
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
    headerStatsDefaultVisible?: boolean;
    headerStatsStorageKey?: string;
    hideDependencyControl?: boolean;
    allowedViewModes?: ViewMode[];
    isProcurementMode?: boolean;
    procurementOffsets?: {
        dueProcurementDays: number;
        dueMaterialOnSiteDays: number;
        dateOfUseOffsetDays: number;
    };
    onProcurementOffsetsChange?: (offsets: {
        dueProcurementDays: number;
        dueMaterialOnSiteDays: number;
        dateOfUseOffsetDays: number;
    }) => void;
    onApplyProcurementOffsetsToAll?: () => Promise<void>;
    isApplyingOffsets?: boolean;
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
    kpiStats,
    visibleColumns,
    onToggleColumn,
    onToggleAllColumns,
    showDependencies,
    onToggleDependencies,
    customDate,
    onCustomDateChange,
    onBudgetChange,
    isExpanded = false,
    onToggleExpand,
    headerStatsDefaultVisible = false,
    headerStatsStorageKey = 'gantt_show_header_stats_v2',
    hideDependencyControl = false,
    allowedViewModes = ['day', 'week', 'month'],
    isProcurementMode = false,
    procurementOffsets = { dueProcurementDays: -14, dueMaterialOnSiteDays: -7, dateOfUseOffsetDays: 0 },
    onProcurementOffsetsChange,
    onApplyProcurementOffsetsToAll,
    isApplyingOffsets = false
}: GanttToolbarProps) {
    const [dateEditMode, setDateEditMode] = React.useState<'all' | 'item'>('all');
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
    const [showHeaderStats, setShowHeaderStats] = React.useState(headerStatsDefaultVisible);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        const saved = localStorage.getItem(headerStatsStorageKey);
        if (saved !== null) {
            setShowHeaderStats(saved === 'true');
        } else {
            setShowHeaderStats(headerStatsDefaultVisible);
        }
    }, [headerStatsStorageKey, headerStatsDefaultVisible]);

    React.useEffect(() => {
        if (typeof window === 'undefined') return;
        localStorage.setItem(headerStatsStorageKey, String(showHeaderStats));
    }, [showHeaderStats, headerStatsStorageKey]);

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
                            {format(timeRange.start, 'd MMM', { locale: enUS })} - {format(timeRange.end, 'd MMM yyyy', { locale: enUS })}
                        </span>
                    </div>
                </div>

                <div className="hidden lg:block w-px h-8 bg-gray-200"></div>

                {/* KPI / Stats Minimalist View */}
                {showHeaderStats && (
                    <div className="hidden lg:flex items-center gap-3">
                        {!isProcurementMode && (
                            <>
                                <div className="flex min-w-[92px] flex-col">
                                    <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold leading-none">Budget</span>
                                    <div className="mt-0.5 flex items-baseline gap-1 leading-none" onDoubleClick={() => setIsBudgetEditing(true)}>
                                        {isBudgetEditing ? (
                                            <input
                                                autoFocus
                                                className="w-20 text-xs font-bold font-mono border-b border-blue-500 outline-none"
                                                value={budgetInput}
                                                onChange={(e) => setBudgetInput(e.target.value)}
                                                onBlur={handleBudgetSubmit}
                                                onKeyDown={(e) => { if (e.key === 'Enter') handleBudgetSubmit(); }}
                                            />
                                        ) : (
                                            <span className="text-base font-bold text-gray-900 font-mono hover:text-blue-600 cursor-pointer" title="Double click to edit">
                                                {budgetStats.totalCost.toLocaleString()}
                                            </span>
                                        )}
                                        <span className="text-[9px] text-gray-500 font-medium">THB</span>
                                    </div>
                                </div>
                                <div className="h-7 w-px bg-gray-200"></div>
                            </>
                        )}
                        <div className="flex min-w-[72px] flex-col">
                            <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold leading-none">Progress</span>
                            <div className="mt-0.5 flex items-baseline gap-1 leading-none">
                                <span className={`text-base font-bold font-mono ${kpiStats.progress > 0 ? 'text-green-600' : 'text-gray-900'}`}>
                                    {kpiStats.progress.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                        <div className="flex min-w-[82px] flex-col">
                            <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold leading-none">Plan-to-Date</span>
                            <div className="mt-0.5 flex items-baseline gap-1 leading-none">
                                <span className="text-base font-bold font-mono text-gray-900">
                                    {kpiStats.planToDate.toFixed(1)}%
                                </span>
                            </div>
                        </div>
                        <div className="flex min-w-[130px] flex-col">
                            <span className="text-[9px] uppercase tracking-wide text-gray-400 font-semibold leading-none">Variance</span>
                            <div className="mt-0.5 flex items-baseline gap-1 leading-none">
                                <span
                                    className={`text-base font-bold font-mono ${kpiStats.varianceDays === null
                                        ? 'text-gray-500'
                                        : kpiStats.varianceDays > 0
                                            ? 'text-green-600'
                                            : kpiStats.varianceDays < 0
                                                ? 'text-red-600'
                                                : 'text-gray-700'
                                        }`}
                                >
                                    {kpiStats.varianceDays === null || kpiStats.variancePercent === null
                                        ? '-'
                                        : `${kpiStats.variancePercent > 0 ? '+' : ''}${kpiStats.variancePercent.toFixed(1)}% (${kpiStats.varianceDays > 0 ? '+' : ''}${kpiStats.varianceDays}d)`}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Right: Controls */}
            <div className="flex items-center gap-4 print-hide ml-auto">

                {/* View Mode Switcher - Segmented Control Style */}
                <div className="flex bg-gray-100/80 p-0.5 rounded-lg">
                    {allowedViewModes.map((mode) => (
                        <button key={mode} onClick={() => onViewModeChange(mode)}
                            className={`px-4 py-1.5 text-xs font-medium rounded-md transition-all capitalize ${viewMode === mode ? 'bg-white text-gray-900 shadow-sm border border-gray-200/50' : 'text-gray-500 hover:text-gray-700'
                                }`}>
                            {mode === 'day' ? 'Day' : mode === 'week' ? 'Week' : 'Month'}
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
                        Today
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
                    {isProcurementMode && (
                        <div className="hidden xl:flex items-center gap-2 mr-2 px-2 py-1 bg-white border border-gray-200 rounded-md shadow-sm">
                            <span className="text-xs font-semibold text-gray-600">Date Mode</span>
                            <button
                                type="button"
                                onClick={() => setDateEditMode('all')}
                                className={`px-2.5 py-1 text-xs rounded border transition-colors ${dateEditMode === 'all'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                Apply All
                            </button>
                            <button
                                type="button"
                                onClick={() => setDateEditMode('item')}
                                className={`px-2.5 py-1 text-xs rounded border transition-colors ${dateEditMode === 'item'
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                                    }`}
                            >
                                Edit Per Item
                            </button>

                            {dateEditMode === 'all' && (
                                <>
                                    <div className="w-px h-4 bg-gray-200 mx-1"></div>
                                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                        Due
                                        <input
                                            type="number"
                                            value={procurementOffsets.dueProcurementDays}
                                            onChange={(e) =>
                                                onProcurementOffsetsChange?.({
                                                    ...procurementOffsets,
                                                    dueProcurementDays: parseInt(e.target.value || '0', 10) || 0
                                                })
                                            }
                                            className="w-12 h-7 text-xs border border-gray-300 rounded px-1 text-center"
                                        />
                                    </label>
                                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                        On Site
                                        <input
                                            type="number"
                                            value={procurementOffsets.dueMaterialOnSiteDays}
                                            onChange={(e) =>
                                                onProcurementOffsetsChange?.({
                                                    ...procurementOffsets,
                                                    dueMaterialOnSiteDays: parseInt(e.target.value || '0', 10) || 0
                                                })
                                            }
                                            className="w-12 h-7 text-xs border border-gray-300 rounded px-1 text-center"
                                        />
                                    </label>
                                    <label className="flex items-center gap-1 text-[11px] text-gray-600">
                                        Use
                                        <input
                                            type="number"
                                            value={procurementOffsets.dateOfUseOffsetDays}
                                            onChange={(e) =>
                                                onProcurementOffsetsChange?.({
                                                    ...procurementOffsets,
                                                    dateOfUseOffsetDays: parseInt(e.target.value || '0', 10) || 0
                                                })
                                            }
                                            className="w-12 h-7 text-xs border border-gray-300 rounded px-1 text-center"
                                        />
                                    </label>
                                    <button
                                        type="button"
                                        onClick={onApplyProcurementOffsetsToAll}
                                        disabled={isApplyingOffsets}
                                        className="ml-1 px-3 py-1.5 text-xs font-semibold rounded border border-blue-600 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors shadow-sm"
                                    >
                                        {isApplyingOffsets ? 'Applying...' : 'Apply To All'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <button
                        onClick={() => setShowHeaderStats(prev => !prev)}
                        title={showHeaderStats ? 'Hide Header Stats' : 'Show Header Stats'}
                        className={`p-2 rounded-md transition-all ${showHeaderStats ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                    >
                        {showHeaderStats ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    {!hideDependencyControl && (
                        <button onClick={onToggleDependencies}
                            title={showDependencies ? 'Hide dependencies' : 'Show dependencies'}
                            className={`p-2 rounded-md transition-all ${showDependencies ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}>
                            <LinkIcon className="w-4 h-4" />
                        </button>
                    )}
                    {onToggleExpand && (
                        <button
                            onClick={onToggleExpand}
                            title={isExpanded ? 'Exit full screen' : 'Full screen'}
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
                            title={Object.values(visibleColumns).some(v => v) ? 'Hide all columns' : 'Show all columns'}
                            className={`p-2 rounded-md transition-all ${Object.values(visibleColumns).every(v => !v) ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                        >
                            {Object.values(visibleColumns).some(v => v) ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                    )}

                    <div className="relative column-menu-trigger">
                        <button
                            onClick={() => setShowColumnMenu(!showColumnMenu)}
                            className={`p-2 rounded-md transition-all ${showColumnMenu ? 'bg-blue-50 text-blue-600' : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600'}`}
                            title="View settings"
                        >
                            <Settings className="w-4 h-4" />
                        </button>

                        {/* Column Menu Dropdown */}
                        {showColumnMenu && visibleColumns && onToggleColumn && (
                            <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-[100] py-2 flex flex-col text-left animate-in fade-in zoom-in-95 duration-100 origin-top-right">
                                <div className="px-4 py-2 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/30">
                                    Show Columns
                                </div>
                                <div className="p-1">
                                    {!isProcurementMode && (
                                        <>
                                            <button onClick={() => onToggleColumn('cost')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Wallet className="w-4 h-4 text-gray-400" /> Cost</span>
                                                {visibleColumns.cost && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('weight')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">W</span> Weight</span>
                                                {visibleColumns.weight && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('quantity')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">Q</span> Quantity</span>
                                                {visibleColumns.quantity && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                        </>
                                    )}
                                    {isProcurementMode && (
                                        <>
                                            <button onClick={() => onToggleColumn('dueProcurement')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Calendar className="w-4 h-4 text-gray-400" /> Due Proc.</span>
                                                {visibleColumns.dueProcurement && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('dueMaterialOnSite')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Calendar className="w-4 h-4 text-gray-400" /> Due On Site</span>
                                                {visibleColumns.dueMaterialOnSite && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('dateOfUse')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Calendar className="w-4 h-4 text-gray-400" /> Date of Use</span>
                                                {visibleColumns.dateOfUse && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('duration')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">D</span> Duration</span>
                                                {visibleColumns.duration && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('procurementStatus')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">S</span> Proc. Status</span>
                                                {visibleColumns.procurementStatus && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                        </>
                                    )}
                                    {!isProcurementMode && (
                                        <>
                                            <button onClick={() => onToggleColumn('period')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Calendar className="w-4 h-4 text-gray-400" /> Period</span>
                                                {visibleColumns.period && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            {Object.prototype.hasOwnProperty.call(visibleColumns, 'planDuration') && (
                                                <button onClick={() => onToggleColumn('planDuration')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                    <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">P</span> Plan (d)</span>
                                                    {visibleColumns.planDuration && <Check className="w-4 h-4 text-blue-600" />}
                                                </button>
                                            )}
                                            {Object.prototype.hasOwnProperty.call(visibleColumns, 'actualDuration') && (
                                                <button onClick={() => onToggleColumn('actualDuration')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                    <span className="flex items-center gap-3"><span className="w-4 h-4 flex items-center justify-center font-bold text-gray-400 text-xs">A</span> Actual (d)</span>
                                                    {visibleColumns.actualDuration && <Check className="w-4 h-4 text-blue-600" />}
                                                </button>
                                            )}
                                            <button onClick={() => onToggleColumn('team')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><Users className="w-4 h-4 text-gray-400" /> Team</span>
                                                {visibleColumns.team && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                            <button onClick={() => onToggleColumn('progress')} className="w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 rounded-md flex items-center justify-between transition-colors">
                                                <span className="flex items-center gap-3"><TrendingUp className="w-4 h-4 text-gray-400" /> Progress (%)</span>
                                                {visibleColumns.progress && <Check className="w-4 h-4 text-blue-600" />}
                                            </button>
                                        </>
                                    )}
                                </div>

                                {/* Reference Date Config */}
                                <div className="px-4 py-2 border-t border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50/30 mt-1">
                                    Reference Date
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
                                        <span className="group-hover:translate-x-0.5 transition-transform">Today (System)</span>
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
                                        <span className="group-hover:translate-x-0.5 transition-transform">Custom</span>
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



