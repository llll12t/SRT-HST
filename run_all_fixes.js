const fs = require('fs');
const files = {
    'src/features/gantt/domain/bars.ts': [
        ['actualStart = dragState.currentStart || parseDate(task.actualStartDate || task.planStartDate);', 'actualStart = dragState.currentStart || parseDate(task.actualStartDate || task.planStartDate)!;'],
        ['actualStart = parseDate(task.actualStartDate!);', 'actualStart = parseDate(task.actualStartDate!)!;'],
        ['actualStart = parseDate(task.planStartDate);', 'actualStart = parseDate(task.planStartDate)!;'],
        ['actualEnd = parseDate(task.actualEndDate!);', 'actualEnd = parseDate(task.actualEndDate!)!;'],
        ['differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1;', 'differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1;'],
        ['taskStart = dragState.currentStart || parseDate(task.planStartDate);', 'taskStart = dragState.currentStart || parseDate(task.planStartDate)!;'],
        ['taskEnd = dragState.currentEnd || parseDate(task.planEndDate);', 'taskEnd = dragState.currentEnd || parseDate(task.planEndDate)!;'],
        ['taskStart = parseDate(task.planStartDate);\n      taskEnd = parseDate(task.planEndDate);', 'taskStart = parseDate(task.planStartDate)!;\n      taskEnd = parseDate(task.planEndDate)!;']
    ],
    'src/features/gantt/domain/summaries.ts': [
        ['const start = parseDate(t.planStartDate);', 'const start = parseDate(t.planStartDate)!;'],
        ['const end = parseDate(t.planEndDate);', 'const end = parseDate(t.planEndDate)!;'],
        ['const d = parseDate(task.planStartDate);\n      if (!minDate', 'const d = parseDate(task.planStartDate)!;\n      if (!minDate'],
        ['const d = parseDate(task.planEndDate);\n      if (!maxDate', 'const d = parseDate(task.planEndDate)!;\n      if (!maxDate'],
        ['const d = parseDate(task.actualStartDate);\n      if (!minActualDate', 'const d = parseDate(task.actualStartDate)!;\n      if (!minActualDate'],
        ['effectiveEnd = parseDate(task.actualEndDate);', 'effectiveEnd = parseDate(task.actualEndDate)!;'],
        ['const pStart = parseDate(task.planStartDate);', 'const pStart = parseDate(task.planStartDate)!;'],
        ['const pEnd = parseDate(task.planEndDate);', 'const pEnd = parseDate(task.planEndDate)!;']
    ],
    'src/features/scurve/domain/weighting.ts': [
        ['const duration = differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1;', 'const duration = differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1;']
    ],
    'src/features/gantt/presentation/components/TaskRow.tsx': [
        ['const planEnd = parseDate(t.planEndDate);\n        const actualEnd = parseDate(t.actualEndDate);', 'const planEnd = parseDate(t.planEndDate)!;\n        const actualEnd = parseDate(t.actualEndDate)!;']
    ],
    'src/features/gantt/presentation/hooks/useGanttTimeline.ts': [
        ['let pStart = startDate ? parseDate(startDate) :', 'let pStart = startDate ? parseDate(startDate)! :'],
        ['let pEnd = endDate ? parseDate(endDate) :', 'let pEnd = endDate ? parseDate(endDate)! :']
    ],
    'src/features/scurve/domain/accumulation.ts': [
        ['const pStart = parseDate(task.planStartDate);\n    const pEnd = parseDate(task.planEndDate);', 'const pStart = parseDate(task.planStartDate)!;\n    const pEnd = parseDate(task.planEndDate)!;'],
        ['let aStart = task.actualStartDate ? parseDate(task.actualStartDate) :', 'let aStart = task.actualStartDate ? parseDate(task.actualStartDate)! :'],
        ['isValid(parseDate(task.actualEndDate))', 'isValid(parseDate(task.actualEndDate)!)'],
        ['aEnd = parseDate(task.actualEndDate);\n    } else {', 'aEnd = parseDate(task.actualEndDate)!;\n    } else {'],
        ['if (task.actualEndDate) {\n      const d = parseDate(task.actualEndDate);\n      if (isValid(d)', 'if (task.actualEndDate) {\n      const d = parseDate(task.actualEndDate)!;\n      if (isValid(d)'],
        ['const d = parseDate(task.actualStartDate);\n      if (isValid(d) && isAfter(d, maxActualDate', 'const d = parseDate(task.actualStartDate)!;\n      if (isValid(d) && isAfter(d, maxActualDate']
    ],
    'src/features/scurve/presentation/components/SCurveChart.tsx': [
        ['totalDuration: leafTasks.reduce((sum, t) => sum + Math.max(0, differenceInDays(parseDate(t.planEndDate), parseDate(t.planStartDate)) + 1), 0)', 'totalDuration: leafTasks.reduce((sum, t) => sum + Math.max(0, differenceInDays(parseDate(t.planEndDate)!, parseDate(t.planStartDate)!) + 1), 0)'],
        ['weight = Math.max(0, differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1);', 'weight = Math.max(0, differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1);'],
        ['return saved ? parseDate(saved) : null;', 'return saved ? parseDate(saved)! : null;'],
        ['const planStart = parseDate(t.planStartDate);\n            const planEnd = parseDate(t.planEndDate);', 'const planStart = parseDate(t.planStartDate)!;\n            const planEnd = parseDate(t.planEndDate)!;'],
        ['differenceInDays(parseDate(task.planEndDate), parseDate(task.planStartDate)) + 1}d</div>}', 'differenceInDays(parseDate(task.planEndDate)!, parseDate(task.planStartDate)!) + 1}d</div>}'],
        ["task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate(task.actualEndDate), parseDate(task.actualStartDate)) + 1 : '-'", "task.actualStartDate && task.actualEndDate ? differenceInDays(parseDate(task.actualEndDate)!, parseDate(task.actualStartDate)!) + 1 : '-'"],
        ["{isValid(parseDate(task.planStartDate)) ? `${format(parseDate(task.planStartDate), 'dd/MM')} - ${format(parseDate(task.planEndDate), 'dd/MM')}` : '-'}", "{isValid(parseDate(task.planStartDate)!) ? `${format(parseDate(task.planStartDate)!, 'dd/MM')} - ${format(parseDate(task.planEndDate)!, 'dd/MM')}` : '-'}"]
    ]
};

for (const [file, replacements] of Object.entries(files)) {
    let content = fs.readFileSync(file, 'utf8');
    for (const [target, replacement] of replacements) {
        if (content.indexOf(target) === -1) {
            console.warn(`WARNING: Target not found in ${file}:\n${target}`);
        }
        content = content.replace(target, replacement);
    }
    fs.writeFileSync(file, content);
}
console.log('Fixed successfully!');
