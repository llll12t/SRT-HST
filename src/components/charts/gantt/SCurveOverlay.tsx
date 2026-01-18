import React from 'react';
import { TrendingUp } from 'lucide-react';
import { GanttConfig } from './types';

interface SCurveOverlayProps {
    showSCurve: boolean;
    scurveData: { date: Date; cumulativePlan: number; cumulativeActual: number }[];
    timelineItems: Date[];
    config: GanttConfig;
    stickyWidth: number;
}

export default function SCurveOverlay({
    showSCurve,
    scurveData,
    timelineItems,
    config,
    stickyWidth
}: SCurveOverlayProps) {
    if (!showSCurve || scurveData.length === 0) return null;

    // Get S-Curve point position
    const getSCurvePosition = (value: number, idx: number) => {
        const x = idx * config.cellWidth + config.cellWidth / 2;
        const y = 60 - (value / 100) * 55; // Scale to fit in 60px height area
        return { x, y };
    };

    // Generate SVG path for S-Curve
    const generateSCurvePath = (type: 'plan' | 'actual'): string => {
        if (scurveData.length < 2) return '';

        const points = scurveData.map((d, idx) => {
            const value = type === 'plan' ? d.cumulativePlan : d.cumulativeActual;
            return getSCurvePosition(value, idx);
        });

        return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    };

    return (
        <div className="flex border-b border-gray-300 bg-gray-50">
            <div className="sticky left-0 z-20 bg-gray-50 border-r border-gray-300 px-4 py-1 shadow-[1px_0_0px_rgba(0,0,0,0.05)]"
                style={{ width: `${stickyWidth}px`, minWidth: `${stickyWidth}px` }}>
                <div className="flex items-center justify-between h-full">
                    <div className="text-xs font-bold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />
                        S-Curve
                    </div>
                    <div className="flex items-center gap-3 text-[10px]">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-0.5 bg-blue-500"></div>
                            <span className="text-gray-600">Plan</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-0.5 bg-green-500"></div>
                            <span className="text-gray-600">Actual</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className="relative h-16" style={{ width: `${timelineItems.length * config.cellWidth}px` }}>
                <svg className="absolute inset-0 w-full h-full overflow-visible" preserveAspectRatio="none">
                    {/* Plan line */}
                    <path
                        d={generateSCurvePath('plan')}
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="2"
                        strokeDasharray="4 2"
                        opacity="0.7"
                    />
                    {/* Actual line */}
                    <path
                        d={generateSCurvePath('actual')}
                        fill="none"
                        stroke="#22c55e"
                        strokeWidth="2.5"
                    />
                </svg>
                {/* Y-axis labels */}
                <div className="absolute left-2 top-1 text-xs text-gray-500">100%</div>
                <div className="absolute left-2 bottom-1 text-xs text-gray-500">0%</div>
            </div>
        </div>
    );
}
