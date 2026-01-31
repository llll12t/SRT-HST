'use client';

import React, { Suspense } from 'react';
import GanttClient from '@/components/gantt/GanttClient';
import { Loader2 } from 'lucide-react';

export default function GanttPage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        }>
            <GanttClient />
        </Suspense>
    );
}
