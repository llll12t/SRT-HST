import React from 'react';
import type { SCurveDataPoint } from '@/components/charts/scurve/hooks/useSCurveData';
import { differenceInDays } from 'date-fns';

interface SCurveGraphProps {
    data: { points: SCurveDataPoint[], maxActualDate: Date };
    width: number;
    height: number;
    timeline: { items: any[] };
    config: { cellWidth: number };
    timeRange: { start: Date };
    viewMode: string;
    totalScope: number;
    mode: 'physical' | 'financial';
    left: number;
}

export const SCurveGraph: React.FC<SCurveGraphProps> = ({
    data,
    width,
    height,
    timeline,
    config,
    timeRange,
    viewMode,
    totalScope,
    mode,
    left
}) => {
    const { points, maxActualDate } = data;

    const getX = (date: Date) => {
        const diff = differenceInDays(date, timeRange.start);
        if (viewMode === 'day') return diff * config.cellWidth;
        if (viewMode === 'week') return (diff / 7) * config.cellWidth;
        // Month approximate
        return (diff / 30.44) * config.cellWidth;
    };

    const getY = (val: number) => {
        return height - (val / 100) * height;
    };

    const today = new Date();
    const todayX = getX(today);

    // Filter points for actual line (up to max date)
    const actualPoints = points.filter(p => p.date <= maxActualDate);

    const formatScope = (val: number, m: 'physical' | 'financial') => {
        if (m === 'financial') return `฿${val.toLocaleString()}`;
        return `${val.toLocaleString()} หน่วยงาน`;
    };

    return (
        <div className="absolute top-0 bottom-0 z-10 pointer-events-none"
            style={{ width: `${width}px`, height: '100%', left: `${left}px` }}>

            <div className="sticky top-0 w-full border-b border-gray-200 bg-white/90 backdrop-blur-sm relative group/chart shadow-sm"
                style={{ height: `${height}px` }}>

                {/* Legend */}
                <div className="absolute top-4 right-14 bg-white/95 p-3 rounded-lg border border-gray-200 shadow-sm z-50 flex flex-col gap-2 pointer-events-auto min-w-[180px]">
                    <div className="text-xs font-bold text-gray-900 border-b border-gray-100 pb-1 mb-1">
                        {mode === 'financial' ? 'Financial (Cost)' : 'Physical (Work)'}
                    </div>
                    <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-blue-500 border border-blue-600"></div>
                            <span className="text-xs font-semibold text-gray-700">Plan</span>
                        </div>
                        <span className="text-xs text-gray-500">{points.length > 0 ? points[points.length - 1].plan.toFixed(1) : 0}%</span>
                    </div>
                    <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full bg-green-500 border border-green-600"></div>
                            <span className="text-xs font-semibold text-gray-700">Actual</span>
                        </div>
                        <span className="text-xs text-gray-500">{actualPoints.length > 0 ? actualPoints[actualPoints.length - 1].actual.toFixed(1) : 0}%</span>
                    </div>
                    <div className="mt-1 pt-1 border-t border-gray-100 text-[10px] text-gray-500 text-right">
                        Total Scope: <span className="font-medium text-gray-900">{formatScope(totalScope, mode)}</span>
                    </div>
                </div>

                <svg width={width} height={height} className="overflow-hidden">
                    {/* Grid Lines */}
                    {timeline.items.map((item, i) => (
                        <line key={i} x1={i * config.cellWidth} y1={0} x2={i * config.cellWidth} y2={height} stroke="#f3f4f6" strokeDasharray="4 4" />
                    ))}

                    {/* Today Line */}
                    {todayX >= 0 && todayX <= width && (
                        <g>
                            <line x1={todayX} y1={0} x2={todayX} y2={height} stroke="#ef4444" strokeWidth="1.5" strokeDasharray="5 4" />
                            <text x={todayX} y={12} fill="#ef4444" fontSize="10" fontWeight="bold" textAnchor="middle">Today</text>
                        </g>
                    )}

                    {/* Plan S-Curve */}
                    <path
                        d={`M0,${height} ` + points.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ')}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d={`M0,${height} ` + points.map(p => `L${getX(p.date)},${getY(p.plan)}`).join(' ') + ` L${getX(points[points.length - 1].date)},${height} Z`}
                        fill="url(#blueGradient)"
                        opacity="0.2"
                    />

                    {/* Actual S-Curve */}
                    {actualPoints.length > 0 && (
                        <>
                            <path
                                d={`M0,${height} ` + actualPoints.map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ')}
                                fill="none"
                                stroke="#22c55e"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            />
                            <path
                                d={`M0,${height} ` + actualPoints.map(p => `L${getX(p.date)},${getY(p.actual)}`).join(' ') + ` L${getX(actualPoints[actualPoints.length - 1].date)},${height} Z`}
                                fill="url(#greenGradient)"
                                opacity="0.2"
                            />
                        </>
                    )}

                    {/* End Point Labels */}
                    {points.length > 0 && (() => {
                        const last = points[points.length - 1];
                        const x = getX(last.date);
                        const y = getY(last.plan);
                        const label = `Plan: ${last.plan.toFixed(1)}%`;
                        // Approx Text width needed
                        const width = 60;
                        return (
                            <g>
                                <rect x={x - width / 2} y={y - 20} width={width} height="16" rx="4" fill="#3b82f6" />
                                <text x={x} y={y - 9} fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">{label}</text>
                            </g>
                        );
                    })()}

                    {actualPoints.length > 0 && (() => {
                        const last = actualPoints[actualPoints.length - 1];
                        const x = getX(last.date);
                        const y = getY(last.actual);
                        const label = `Actual: ${last.actual.toFixed(1)}%`;
                        const width = 65;
                        return (
                            <g>
                                <rect x={x - width / 2} y={y + 5} width={width} height="16" rx="4" fill="#22c55e" />
                                <text x={x} y={y + 16} fill="white" fontSize="10" fontWeight="bold" textAnchor="middle">{label}</text>
                            </g>
                        );
                    })()}

                    <defs>
                        <linearGradient id="blueGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#3b82f6" />
                            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
                        </linearGradient>
                        <linearGradient id="greenGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#22c55e" />
                            <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                        </linearGradient>
                    </defs>
                </svg>
            </div>
        </div>
    );
};
