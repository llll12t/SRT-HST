import React, { use } from 'react';
import GanttClient from '@/components/gantt/GanttClient';

interface PageProps {
    params: Promise<{
        id: string;
    }>;
}

export default function ProcurementPage({ params }: PageProps) {
    const { id } = use(params);

    return (
        <GanttClient
            preSelectedProjectId={id}
            pageTitle="Procurement Gantt"
            pageSubtitle="Procurement plan based on the same project data"
            isProcurementPage
        />
    );
}
