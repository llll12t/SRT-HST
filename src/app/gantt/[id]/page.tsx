'use client';

import React, { use } from 'react';
import GanttPageClient from '@/features/gantt/presentation/routes/GanttPageClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProjectGanttPage({ params }: PageProps) {
    const { id } = use(params);
    return <GanttPageClient preSelectedProjectId={id} />;
}
