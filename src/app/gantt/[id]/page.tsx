'use client';

import React, { use } from 'react';
import GanttClient from '@/components/gantt/GanttClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProjectGanttPage({ params }: PageProps) {
    const { id } = use(params);
    return <GanttClient preSelectedProjectId={id} />;
}
