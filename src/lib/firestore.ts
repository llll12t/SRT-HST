import {
    collection,
    doc,
    getDocs,
    getDoc,
    addDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    Timestamp,
    serverTimestamp,
    writeBatch,
    setDoc
} from 'firebase/firestore';
import { db } from './firebase';
import { Project, Task, WeeklyLog, Member, Employee, Expense } from '@/types/construction';
import { todayISO, calcDurationDays } from '@/lib/dateUtils';
import { differenceInDays, parseISO } from 'date-fns';

// Helper to remove undefined values for Firestore
const removeUndefined = (obj: any) => {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
        if (obj[key] !== undefined) {
            newObj[key] = obj[key];
        }
    });
    return newObj;
};

// ==================== PROJECTS ====================

export async function getProjects(): Promise<Project[]> {
    const projectsRef = collection(db, 'projects');
    const q = query(projectsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Project[];
}

export async function getProject(projectId: string): Promise<Project | null> {
    const docRef = doc(db, 'projects', projectId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Project;
}

export async function createProject(project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const projectsRef = collection(db, 'projects');
    const docRef = await addDoc(projectsRef, {
        ...project,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

// Alias for easier import in other files
export const addProject = createProject;

export async function updateProject(projectId: string, data: Partial<Project>): Promise<void> {
    const docRef = doc(db, 'projects', projectId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteProject(projectId: string): Promise<void> {
    // Cascade delete: delete all tasks associated with this project first
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('projectId', '==', projectId));
    const snapshot = await getDocs(q);

    // Delete all tasks with chunking
    const chunkSize = 450;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    // Delete the project (separate batch to ensure tasks are gone or just separate call)
    await deleteDoc(doc(db, 'projects', projectId));
}

// ==================== TASKS ====================

export async function getTasks(projectId: string): Promise<Task[]> {
    const tasksRef = collection(db, 'tasks');
    const q = query(
        tasksRef,
        where('projectId', '==', projectId)
    );
    const snapshot = await getDocs(q);

    const tasks = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Task[];

    // Sort by order client-side to avoid composite index requirement
    return tasks.sort((a, b) => (a.order || 0) - (b.order || 0));
}

export async function getAllTasks(): Promise<Task[]> {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Task[];
}

export async function getTask(taskId: string): Promise<Task | null> {
    const docRef = doc(db, 'tasks', taskId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Task;
}

export async function createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const tasksRef = collection(db, 'tasks');
    const docRef = await addDoc(tasksRef, {
        ...removeUndefined(task),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });

    // Auto-sync hierarchy
    if (task.parentTaskId) {
        await syncGroupProgress(task.parentTaskId);
    } else {
        await syncProjectProgress(task.projectId);
    }

    return docRef.id;
}

export function getNewTaskId(): string {
    return doc(collection(db, 'tasks')).id;
}

// Fix type definition to properly allow optional ID
export async function batchCreateTasks(projectId: string, tasks: (Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'projectId'> & { id?: string })[]): Promise<void> {
    const batch = writeBatch(db);
    const tasksRef = collection(db, 'tasks');

    tasks.forEach(task => {
        // Use provided ID if available, otherwise generate new one
        const newDocRef = task.id ? doc(tasksRef, task.id) : doc(tasksRef);
        batch.set(newDocRef, {
            ...removeUndefined(task),
            projectId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
    });

    await batch.commit();

    // Sync progress once after all tasks are added
    await syncProjectProgress(projectId);
}

// Alias for easier import
export const addTask = createTask;

export async function updateTask(taskId: string, data: Partial<Task>): Promise<void> {
    // Get task first to know projectId
    const task = await getTask(taskId);

    const docRef = doc(db, 'tasks', taskId);
    await updateDoc(docRef, {
        ...removeUndefined(data),
        updatedAt: serverTimestamp()
    });

    // Auto-sync project progress
    // Auto-sync hierarchy
    if (data.parentTaskId !== undefined) {
        // If parent changed, sync BOTH old and new parents (complex, simplified here to just new)
        if (data.parentTaskId) await syncGroupProgress(data.parentTaskId);
    } else if (task && task.parentTaskId) {
        await syncGroupProgress(task.parentTaskId);
    }

    // Always sync project just in case
    if (task) await syncProjectProgress(data.projectId || task.projectId);
}

export async function updateTaskProgress(taskId: string, progress: number): Promise<void> {
    // Get task first to know projectId and current state
    const task = await getTask(taskId);
    if (!task) return;

    const docRef = doc(db, 'tasks', taskId);
    const today = todayISO();

    let status: Task['status'] = 'not-started';
    if (progress === 100) status = 'completed';
    else if (progress > 0) status = 'in-progress';

    // Prepare update data
    const updateData: Record<string, unknown> = {
        progress,
        status,
        updatedAt: serverTimestamp()
    };

    // Auto-set actualStartDate when work begins (0% -> >0%)
    if (!task.actualStartDate && progress > 0) {
        updateData.actualStartDate = today;
    }

    // Auto-set actualEndDate when work completes (reaches 100%)
    if (progress === 100 && !task.actualEndDate) {
        updateData.actualEndDate = today;
    }

    // Clear actualEndDate if progress drops below 100% (reopened task)
    if (progress < 100 && task.actualEndDate) {
        updateData.actualEndDate = null;
    }

    await updateDoc(docRef, updateData);

    // Auto-sync hierarchy
    if (task.parentTaskId) {
        await syncGroupProgress(task.parentTaskId);
    }
    await syncProjectProgress(task.projectId);
}

export async function deleteTask(taskId: string): Promise<void> {
    // Get task first to know projectId
    const task = await getTask(taskId);

    const docRef = doc(db, 'tasks', taskId);
    await deleteDoc(docRef);

    // Auto-sync hierarchy
    if (task && task.parentTaskId) {
        await syncGroupProgress(task.parentTaskId);
    } else if (task) {
        await syncProjectProgress(task.projectId);
    }
}

export async function deleteAllTasks(projectId: string): Promise<void> {
    const tasksRef = collection(db, 'tasks');
    const q = query(tasksRef, where('projectId', '==', projectId));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    // Batch delete with chunking (Firestore limit 500)
    const chunkSize = 450;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += chunkSize) {
        const chunk = docs.slice(i, i + chunkSize);
        const batch = writeBatch(db);
        chunk.forEach((doc) => {
            batch.delete(doc.ref);
        });
        await batch.commit();
    }

    // Reset project progress
    try {
        await updateProject(projectId, { overallProgress: 0 });
    } catch (e) {
        // Ignore if project update fails (e.g. project deleted)
    }
}

// ==================== WEEKLY LOGS ====================

export async function getWeeklyLogs(projectId: string): Promise<WeeklyLog[]> {
    const logsRef = collection(db, 'weeklyLogs');
    const q = query(
        logsRef,
        where('projectId', '==', projectId),
        orderBy('weekNumber', 'asc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as WeeklyLog[];
}

export async function createWeeklyLog(log: Omit<WeeklyLog, 'id' | 'createdAt'>): Promise<string> {
    const logsRef = collection(db, 'weeklyLogs');
    const docRef = await addDoc(logsRef, {
        ...log,
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateWeeklyLog(logId: string, data: Partial<WeeklyLog>): Promise<void> {
    const docRef = doc(db, 'weeklyLogs', logId);
    await updateDoc(docRef, data);
}

// ==================== UTILITY FUNCTIONS ====================

export async function calculateProjectProgress(projectId: string): Promise<number> {
    const tasks = await getTasks(projectId);
    if (tasks.length === 0) return 0;
    const totalDuration = tasks.reduce((sum, task) => sum + Math.max(0, calcDurationDays(task.planStartDate, task.planEndDate)), 0);
    if (totalDuration <= 0) return 0;
    const weightedProgress = tasks.reduce((sum, task) => {
        const duration = calcDurationDays(task.planStartDate, task.planEndDate);
        const weight = (totalDuration > 0 ? duration / totalDuration : 0) * 100;
        return sum + (weight * (Number(task.progress) || 0) / 100);
    }, 0);
    return weightedProgress;
}

export async function syncGroupProgress(parentId: string): Promise<void> {
    if (!parentId) return;

    try {
        const parentRef = doc(db, 'tasks', parentId);
        const parentSnap = await getDoc(parentRef);
        if (!parentSnap.exists()) return;

        const parentData = parentSnap.data() as Task;
        // Only update if it is a GROUP
        if (parentData.type !== 'group') return;

        const tasksRef = collection(db, 'tasks');
        const q = query(tasksRef, where('parentTaskId', '==', parentId));
        const snapshots = await getDocs(q);

        const children = snapshots.docs.map(d => ({ id: d.id, ...d.data() })) as Task[];

        if (children.length === 0) return;

        // Calculate aggregates
        let minStart = children[0].planStartDate;
        let maxEnd = children[0].planEndDate;
        let totalCost = 0;

        // Progress Weighting (Duration based)
        let totalWeight = 0;
        let weightedProgressSum = 0;

        children.forEach(child => {
            if (!child.planStartDate || !child.planEndDate) return;

            if (child.planStartDate < minStart) minStart = child.planStartDate;
            if (child.planEndDate > maxEnd) maxEnd = child.planEndDate;

            totalCost += (Number(child.cost) || 0);

            // Duration in days
            const d = differenceInDays(parseISO(child.planEndDate), parseISO(child.planStartDate)) + 1;
            const weight = Math.max(1, d); // Ensure at least 1 day weight

            totalWeight += weight;
            weightedProgressSum += (weight * (Number(child.progress) || 0));
        });

        const newProgress = totalWeight > 0 ? weightedProgressSum / totalWeight : 0;
        const newDuration = differenceInDays(parseISO(maxEnd), parseISO(minStart)) + 1;

        await updateDoc(parentRef, {
            planStartDate: minStart,
            planEndDate: maxEnd,
            planDuration: Math.max(1, newDuration),
            cost: totalCost,
            progress: Math.round(newProgress * 100) / 100,
            updatedAt: serverTimestamp()
        });

        // Recurse up
        if (parentData.parentTaskId) {
            await syncGroupProgress(parentData.parentTaskId);
        } else {
            await syncProjectProgress(parentData.projectId);
        }
    } catch (error) {
        console.error('Error syncing group progress:', error);
    }
}

export async function syncProjectProgress(projectId: string): Promise<void> {
    try {
        // Check if project exists first
        const project = await getProject(projectId);
        if (!project) {
            console.warn(`Project ${projectId} not found, skipping progress sync`);
            return;
        }

        const progress = await calculateProjectProgress(projectId);
        await updateProject(projectId, { overallProgress: Math.round(progress * 100) / 100 });
    } catch (error) {
        console.error(`Error syncing progress for project ${projectId}:`, error);
        // Don't throw - just log the error to prevent cascading failures
    }
}

export async function clearAllData(): Promise<void> {
    const projects = await getProjects();
    const tasks = await getAllTasks();
    // Batch delete would be better but limiting to 500, simple loop for now provided data is small
    // Ideally use batched writes

    for (const p of projects) {
        await deleteProject(p.id);
    }

    // Deleting projects doesn't auto-delete subcollections/tasks in basic logic often, so delete tasks explicitly
    // Firestore doesn't cascade delete automatically
    for (const t of tasks) {
        await deleteTask(t.id);
        // Note: deleteTask calls syncProjectProgress, might error if project gone. 
        // But here we don't care about sync since we nuking everything.
    }

    // Also clear logs?
    // Let's assume yes. But simpler just projects/tasks for basic reset.
}

// ==================== SEED DATA ====================

export async function seedSampleData(): Promise<void> {
    // Check if data already exists
    const projects = await getProjects();
    if (projects.length > 0) {
        console.log('Data already exists, skipping seed');
        return;
    }

    // Create sample project
    const projectId = await createProject({
        name: 'Entrance 1 Construction',
        owner: 'SCCC',
        description: 'งานก่อสร้าง Entrance 1 และงานรั้ว Area 1-2',
        startDate: '2024-09-01',
        endDate: '2025-04-30',
        overallProgress: 78.17,
        status: 'in-progress'
    });

    // Create sample tasks
    const sampleTasks = [
        { category: 'งานเตรียมการ', name: 'งานเขียนแบบและตรวจสร้าง', progress: 100 },
        { category: 'งานเตรียมการ', name: 'งานเตรียมการในการก่อสร้าง', progress: 100 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.123-144) ไม่เสียพื้น', progress: 100 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.137-122)', progress: 98 },
        { category: 'งานรั้ว Area 1', name: 'Fence type "F" (No.108-119)', progress: 98 },
        { category: 'งานรั้ว Area 2', name: 'Concrete road entrance ซอย 3, A2', progress: 0 },
        { category: 'งานรั้ว Area 2', name: 'Concrete road entrance ซอย 4, A2', progress: 0 },
    ];

    for (let i = 0; i < sampleTasks.length; i++) {
        const task = sampleTasks[i];
        await createTask({
            projectId,
            category: task.category,
            name: task.name,
            planStartDate: '2024-09-01',
            planEndDate: '2025-04-30',
            planDuration: 240,
            progress: task.progress,
            status: task.progress === 100 ? 'completed' : task.progress > 0 ? 'in-progress' : 'not-started',
            order: i + 1
        });
    }

    console.log('Sample data seeded successfully');
}

export interface SeedFullDemoProjectResult {
    created: boolean;
    message: string;
    projectId?: string;
    taskCount: number;
    expenseCount: number;
    weeklyLogCount: number;
}

export async function seedFullDemoProject(): Promise<SeedFullDemoProjectResult> {
    const demoProjectCode = 'DEMO-FULL-001';
    const existingProjects = await getProjects();
    const existingDemo = existingProjects.find(
        (project) => (project.code || '').trim().toUpperCase() === demoProjectCode
    );

    if (existingDemo) {
        return {
            created: false,
            message: `Demo project already exists (${demoProjectCode})`,
            projectId: existingDemo.id,
            taskCount: 0,
            expenseCount: 0,
            weeklyLogCount: 0
        };
    }

    const projectId = await createProject({
        name: 'Full Demo Project - Riverside Office',
        code: demoProjectCode,
        owner: 'SRT-HST Demo Team',
        description: 'Full demo dataset for real workflow testing (tasks, cost codes, expenses, and weekly logs).',
        startDate: '2025-01-06',
        endDate: '2025-08-31',
        overallProgress: 0,
        status: 'in-progress',
        categoryOrder: ['Preparation', 'Structure', 'Architecture', 'MEP']
    });

    const taskStatusFromProgress = (progress: number, forceDelayed?: boolean): Task['status'] => {
        if (forceDelayed) return 'delayed';
        if (progress >= 100) return 'completed';
        if (progress > 0) return 'in-progress';
        return 'not-started';
    };

    const durationDays = (start: string, end: string) =>
        Math.max(1, differenceInDays(parseISO(end), parseISO(start)) + 1);

    const demoTasks: Array<{
        category: string;
        subcategory: string;
        subsubcategory?: string;
        name: string;
        responsible: string;
        costCode: string;
        cost: number;
        quantity: string;
        planStartDate: string;
        planEndDate: string;
        progress: number;
        actualStartDate?: string;
        actualEndDate?: string;
        delayed?: boolean;
    }> = [
            {
                category: 'Preparation',
                subcategory: 'Planning',
                name: 'Permit approval and survey handover',
                responsible: 'Project Manager',
                costCode: '18',
                cost: 65000,
                quantity: '1 lot',
                planStartDate: '2025-01-06',
                planEndDate: '2025-01-15',
                progress: 100,
                actualStartDate: '2025-01-06',
                actualEndDate: '2025-01-14'
            },
            {
                category: 'Preparation',
                subcategory: 'Site Setup',
                name: 'Temporary facilities and safety setup',
                responsible: 'Site Engineer',
                costCode: '18',
                cost: 120000,
                quantity: '1 lot',
                planStartDate: '2025-01-10',
                planEndDate: '2025-01-25',
                progress: 100,
                actualStartDate: '2025-01-10',
                actualEndDate: '2025-01-24'
            },
            {
                category: 'Structure',
                subcategory: 'Foundation',
                name: 'Earthwork and compaction',
                responsible: 'Civil Engineer',
                costCode: '16',
                cost: 220000,
                quantity: '1,800 m3',
                planStartDate: '2025-01-20',
                planEndDate: '2025-02-02',
                progress: 100,
                actualStartDate: '2025-01-20',
                actualEndDate: '2025-02-01'
            },
            {
                category: 'Structure',
                subcategory: 'Foundation',
                name: 'Footing rebar installation',
                responsible: 'Civil Engineer',
                costCode: '1',
                cost: 280000,
                quantity: '14 tons',
                planStartDate: '2025-02-03',
                planEndDate: '2025-02-18',
                progress: 100,
                actualStartDate: '2025-02-03',
                actualEndDate: '2025-02-18'
            },
            {
                category: 'Structure',
                subcategory: 'Foundation',
                name: 'Footing concrete casting',
                responsible: 'Civil Engineer',
                costCode: '3',
                cost: 360000,
                quantity: '240 m3',
                planStartDate: '2025-02-12',
                planEndDate: '2025-02-26',
                progress: 100,
                actualStartDate: '2025-02-12',
                actualEndDate: '2025-02-27'
            },
            {
                category: 'Structure',
                subcategory: 'Frame',
                subsubcategory: 'Level 1',
                name: 'Column and beam rebar',
                responsible: 'Structure Foreman',
                costCode: '1',
                cost: 320000,
                quantity: '12 tons',
                planStartDate: '2025-03-01',
                planEndDate: '2025-03-20',
                progress: 80,
                actualStartDate: '2025-03-02'
            },
            {
                category: 'Structure',
                subcategory: 'Frame',
                subsubcategory: 'Level 1',
                name: 'Beam and slab formwork',
                responsible: 'Structure Foreman',
                costCode: '4',
                cost: 250000,
                quantity: '1,450 m2',
                planStartDate: '2025-03-05',
                planEndDate: '2025-03-24',
                progress: 70,
                actualStartDate: '2025-03-06'
            },
            {
                category: 'Structure',
                subcategory: 'Frame',
                subsubcategory: 'Level 1',
                name: 'Slab concrete casting',
                responsible: 'Site Engineer',
                costCode: '3',
                cost: 300000,
                quantity: '210 m3',
                planStartDate: '2025-03-18',
                planEndDate: '2025-04-04',
                progress: 55,
                actualStartDate: '2025-03-19'
            },
            {
                category: 'MEP',
                subcategory: 'Electrical',
                subsubcategory: 'Level 1',
                name: 'Electrical rough-in',
                responsible: 'MEP Engineer',
                costCode: '9',
                cost: 240000,
                quantity: '1 lot',
                planStartDate: '2025-04-01',
                planEndDate: '2025-04-25',
                progress: 45,
                actualStartDate: '2025-04-01',
                delayed: true
            },
            {
                category: 'MEP',
                subcategory: 'Plumbing',
                subsubcategory: 'Level 1',
                name: 'Plumbing rough-in',
                responsible: 'MEP Engineer',
                costCode: '10',
                cost: 190000,
                quantity: '1 lot',
                planStartDate: '2025-04-03',
                planEndDate: '2025-04-28',
                progress: 40,
                actualStartDate: '2025-04-04'
            },
            {
                category: 'Architecture',
                subcategory: 'Wall and Ceiling',
                subsubcategory: 'Level 1',
                name: 'Wall framing and gypsum boards',
                responsible: 'Architectural Foreman',
                costCode: '6',
                cost: 220000,
                quantity: '980 m2',
                planStartDate: '2025-04-20',
                planEndDate: '2025-05-18',
                progress: 30,
                actualStartDate: '2025-04-24'
            },
            {
                category: 'Architecture',
                subcategory: 'Roof',
                name: 'Roof steel frame',
                responsible: 'Architectural Foreman',
                costCode: '2',
                cost: 260000,
                quantity: '8 tons',
                planStartDate: '2025-05-01',
                planEndDate: '2025-05-22',
                progress: 20,
                actualStartDate: '2025-05-04'
            },
            {
                category: 'Architecture',
                subcategory: 'Roof',
                name: 'Roofing sheet installation',
                responsible: 'Architectural Foreman',
                costCode: '5',
                cost: 180000,
                quantity: '920 m2',
                planStartDate: '2025-05-18',
                planEndDate: '2025-06-10',
                progress: 0
            },
            {
                category: 'Architecture',
                subcategory: 'Finishes',
                name: 'Flooring and tiles',
                responsible: 'Architectural Foreman',
                costCode: '7',
                cost: 150000,
                quantity: '1,100 m2',
                planStartDate: '2025-06-01',
                planEndDate: '2025-06-25',
                progress: 0
            },
            {
                category: 'Architecture',
                subcategory: 'Finishes',
                name: 'Painting and protective coating',
                responsible: 'Architectural Foreman',
                costCode: '12',
                cost: 130000,
                quantity: '3,400 m2',
                planStartDate: '2025-06-15',
                planEndDate: '2025-07-12',
                progress: 0
            },
            {
                category: 'Architecture',
                subcategory: 'Finishes',
                name: 'Sanitary fixtures and accessories',
                responsible: 'MEP Engineer',
                costCode: '13',
                cost: 170000,
                quantity: '22 sets',
                planStartDate: '2025-07-01',
                planEndDate: '2025-07-20',
                progress: 0
            },
            {
                category: 'MEP',
                subcategory: 'HVAC',
                name: 'VRV air conditioning system',
                responsible: 'MEP Engineer',
                costCode: '15',
                cost: 300000,
                quantity: '1 lot',
                planStartDate: '2025-07-05',
                planEndDate: '2025-08-05',
                progress: 0
            },
            {
                category: 'Architecture',
                subcategory: 'Finishes',
                name: 'Built-in furniture package',
                responsible: 'Architectural Foreman',
                costCode: '14',
                cost: 280000,
                quantity: '1 lot',
                planStartDate: '2025-07-15',
                planEndDate: '2025-08-20',
                progress: 0
            }
        ];

    for (let index = 0; index < demoTasks.length; index++) {
        const task = demoTasks[index];
        await createTask({
            projectId,
            category: task.category,
            subcategory: task.subcategory,
            subsubcategory: task.subsubcategory,
            name: task.name,
            responsible: task.responsible,
            costCode: task.costCode,
            cost: task.cost,
            quantity: task.quantity,
            planStartDate: task.planStartDate,
            planEndDate: task.planEndDate,
            planDuration: durationDays(task.planStartDate, task.planEndDate),
            actualStartDate: task.actualStartDate,
            actualEndDate: task.actualEndDate,
            dueProcurementDate: task.planStartDate,
            dueMaterialOnSiteDate: task.planStartDate,
            dateOfUse: task.planStartDate,
            procurementStatus: task.progress > 0 ? 'actual' : 'to-order',
            progress: task.progress,
            status: taskStatusFromProgress(task.progress, task.delayed),
            order: index + 1
        });
    }

    const demoExpenses: Omit<Expense, 'id' | 'createdAt'>[] = [
        { projectId, date: '2025-01-08', amount: 32000, description: 'Permit and survey fees', costCode: '18', type: 'overhead' },
        { projectId, date: '2025-01-15', amount: 55000, description: 'Temporary office and utilities', costCode: '18', type: 'overhead' },
        { projectId, date: '2025-01-26', amount: 96000, description: 'Earthwork subcontract payment', costCode: '16', type: 'subcontract' },
        { projectId, date: '2025-02-05', amount: 110000, description: 'Rebar delivery for foundation', costCode: '1', type: 'material' },
        { projectId, date: '2025-02-14', amount: 148000, description: 'Concrete batch #1', costCode: '3', type: 'material' },
        { projectId, date: '2025-02-24', amount: 88000, description: 'Concrete batch #2', costCode: '3', type: 'material' },
        { projectId, date: '2025-03-04', amount: 124000, description: 'Rebar for frame level 1', costCode: '1', type: 'material' },
        { projectId, date: '2025-03-11', amount: 64000, description: 'Formwork timber and accessories', costCode: '4', type: 'material' },
        { projectId, date: '2025-03-22', amount: 132000, description: 'Concrete slab level 1', costCode: '3', type: 'material' },
        { projectId, date: '2025-04-02', amount: 72000, description: 'Electrical conduits and wires', costCode: '9', type: 'material' },
        { projectId, date: '2025-04-06', amount: 58000, description: 'Plumbing pipes and fittings', costCode: '10', type: 'material' },
        { projectId, date: '2025-04-18', amount: 44000, description: 'MEP labor progress payment', costCode: '9', type: 'labor' },
        { projectId, date: '2025-04-28', amount: 51000, description: 'Wall framing and gypsum boards', costCode: '6', type: 'material' },
        { projectId, date: '2025-05-08', amount: 97000, description: 'Roof steel purchase', costCode: '2', type: 'material' },
        { projectId, date: '2025-05-20', amount: 69000, description: 'Roofing sheet down payment', costCode: '5', type: 'material' },
        { projectId, date: '2025-05-27', amount: 36000, description: 'General site overhead', costCode: '11', type: 'overhead' }
    ];

    for (const expense of demoExpenses) {
        await createExpense(expense);
    }

    const demoWeeklyLogs = [
        { weekNumber: 2, startDate: '2025-01-06', endDate: '2025-01-12', planned: 3, actual: 4, notes: 'Mobilization completed' },
        { weekNumber: 3, startDate: '2025-01-13', endDate: '2025-01-19', planned: 6, actual: 7, notes: 'Site setup ahead of plan' },
        { weekNumber: 4, startDate: '2025-01-20', endDate: '2025-01-26', planned: 10, actual: 11, notes: 'Earthwork started' },
        { weekNumber: 5, startDate: '2025-01-27', endDate: '2025-02-02', planned: 14, actual: 15, notes: 'Earthwork completed' },
        { weekNumber: 6, startDate: '2025-02-03', endDate: '2025-02-09', planned: 18, actual: 18, notes: 'Foundation rebar ongoing' },
        { weekNumber: 7, startDate: '2025-02-10', endDate: '2025-02-16', planned: 23, actual: 22, notes: 'Concrete pour shifted by weather' },
        { weekNumber: 8, startDate: '2025-02-17', endDate: '2025-02-23', planned: 28, actual: 27, notes: 'Foundation wraps up' },
        { weekNumber: 9, startDate: '2025-02-24', endDate: '2025-03-02', planned: 33, actual: 31, notes: 'Frame work starts' },
        { weekNumber: 10, startDate: '2025-03-03', endDate: '2025-03-09', planned: 38, actual: 35, notes: 'Rebar productivity lower than plan' },
        { weekNumber: 11, startDate: '2025-03-10', endDate: '2025-03-16', planned: 43, actual: 39, notes: 'Material delivery delay on site' },
        { weekNumber: 12, startDate: '2025-03-17', endDate: '2025-03-23', planned: 47, actual: 42, notes: 'Formwork catch-up in progress' },
        { weekNumber: 13, startDate: '2025-03-24', endDate: '2025-03-30', planned: 51, actual: 45, notes: 'Concrete work stabilized' }
    ];

    for (const log of demoWeeklyLogs) {
        await createWeeklyLog({
            projectId,
            weekNumber: log.weekNumber,
            year: 2025,
            startDate: log.startDate,
            endDate: log.endDate,
            plannedCumulativeProgress: log.planned,
            actualCumulativeProgress: log.actual,
            gap: log.actual - log.planned,
            notes: log.notes
        });
    }

    await syncProjectProgress(projectId);

    return {
        created: true,
        message: 'Full demo project created successfully',
        projectId,
        taskCount: demoTasks.length,
        expenseCount: demoExpenses.length,
        weeklyLogCount: demoWeeklyLogs.length
    };
}

// ==================== MEMBERS ====================

export async function getMembers(): Promise<Member[]> {
    const membersRef = collection(db, 'members');
    // Remove orderBy to ensure we get ALL members, even those manually added without createdAt
    const q = query(membersRef);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Member[];
}

export async function getMember(memberId: string): Promise<Member | null> {
    const docRef = doc(db, 'members', memberId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Member;
}

export async function createMember(member: Omit<Member, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const membersRef = collection(db, 'members');
    const docRef = await addDoc(membersRef, {
        ...member,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateMember(memberId: string, data: Partial<Member>): Promise<void> {
    const docRef = doc(db, 'members', memberId);
    await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp()
    });
}

export async function deleteMember(memberId: string): Promise<void> {
    const docRef = doc(db, 'members', memberId);
    await deleteDoc(docRef);
}

// ==================== EMPLOYEES ====================

export async function getEmployees(): Promise<Employee[]> {
    const employeesRef = collection(db, 'employees');
    const q = query(employeesRef);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Employee[];
}

export async function getEmployee(employeeId: string): Promise<Employee | null> {
    const docRef = doc(db, 'employees', employeeId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) return null;

    return {
        id: snapshot.id,
        ...snapshot.data()
    } as Employee;
}

export async function createEmployee(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const employeesRef = collection(db, 'employees');
    const docRef = await addDoc(employeesRef, {
        ...removeUndefined(employee),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
    });
    return docRef.id;
}

export async function updateEmployee(employeeId: string, data: Partial<Employee>): Promise<void> {
    const docRef = doc(db, 'employees', employeeId);
    await updateDoc(docRef, {
        ...removeUndefined(data),
        updatedAt: serverTimestamp()
    });
}

export async function deleteEmployee(employeeId: string): Promise<void> {
    const docRef = doc(db, 'employees', employeeId);
    await deleteDoc(docRef);
}

// Seed initial members if none exist
export async function seedMembers(): Promise<void> {
    const members = await getMembers();
    if (members.length > 0) {
        console.log('Members already exist, skipping seed');
        return;
    }

    const defaultMembers = [
        { name: 'Admin User', email: 'admin@company.com', phone: '081-234-5678', role: 'admin' as const },
        { name: 'สมชาย ใจดี', email: 'somchai@company.com', phone: '082-345-6789', role: 'project_manager' as const },
        { name: 'สมหญิง รักงาน', email: 'somying@company.com', phone: '083-456-7890', role: 'engineer' as const },
    ];

    for (const member of defaultMembers) {
        await createMember(member);
    }

    console.log('Default members seeded successfully');
}

// ==================== USER SETTINGS ====================

export async function getUserSettings(userId: string): Promise<Record<string, unknown> | null> {
    if (!userId) return null;

    const settingsRef = doc(db, 'members', userId, 'settings', 'app');
    const snapshot = await getDoc(settingsRef);
    if (!snapshot.exists()) return null;

    const payload = snapshot.data() as { settings?: Record<string, unknown> };
    if (!payload?.settings || typeof payload.settings !== 'object') {
        return null;
    }

    return payload.settings;
}

export async function saveUserSettings(userId: string, settings: Record<string, unknown>): Promise<void> {
    if (!userId) return;

    const settingsRef = doc(db, 'members', userId, 'settings', 'app');
    await setDoc(settingsRef, {
        userId,
        settings: removeUndefined(settings),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    }, { merge: true });
}

// ==================== CSV TEMPLATE ====================

export interface CsvTemplateDoc {
    userId: string;
    name: string;
    data: Record<string, unknown>;
    createdAt?: Timestamp;
    updatedAt?: Timestamp;
}

const encodeTemplateDocId = (name: string) => encodeURIComponent(name);

export async function getCsvTemplates(userId: string): Promise<Record<string, Record<string, unknown>>> {
    const templatesRef = collection(db, 'members', userId, 'csvTemplates');
    const snapshot = await getDocs(templatesRef);

    const result: Record<string, Record<string, unknown>> = {};
    snapshot.docs.forEach((docSnap) => {
        const payload = docSnap.data() as CsvTemplateDoc;
        if (payload?.name && payload?.data && typeof payload.data === 'object') {
            result[payload.name] = payload.data;
        }
    });

    return result;
}

export async function saveCsvTemplate(
    userId: string,
    name: string,
    data: Record<string, unknown>
): Promise<void> {
    const cleanedName = name.trim();
    if (!cleanedName) throw new Error('Template name is required');

    const templateRef = doc(db, 'members', userId, 'csvTemplates', encodeTemplateDocId(cleanedName));
    await setDoc(templateRef, {
        userId,
        name: cleanedName,
        data: removeUndefined(data),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp()
    }, { merge: true });
}

export async function deleteCsvTemplate(userId: string, name: string): Promise<void> {
    const cleanedName = name.trim();
    if (!cleanedName) return;
    const templateRef = doc(db, 'members', userId, 'csvTemplates', encodeTemplateDocId(cleanedName));
    await deleteDoc(templateRef);
}

// ==================== EXPENSES ====================

export async function getExpenses(projectId?: string): Promise<Expense[]> {
    const expensesRef = collection(db, 'expenses');
    let q;

    if (projectId) {
        q = query(expensesRef, where('projectId', '==', projectId), orderBy('date', 'desc'));
    } else {
        q = query(expensesRef, orderBy('date', 'desc'));
    }

    const snapshot = await getDocs(q);

    return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    })) as Expense[];
}

export async function createExpense(expense: Omit<Expense, 'id' | 'createdAt'>): Promise<string> {
    const expensesRef = collection(db, 'expenses');
    const docRef = await addDoc(expensesRef, {
        ...removeUndefined(expense),
        createdAt: serverTimestamp()
    });
    return docRef.id;
}

export async function deleteExpense(expenseId: string): Promise<void> {
    const docRef = doc(db, 'expenses', expenseId);
    await deleteDoc(docRef);
}
