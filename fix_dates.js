const fs = require('fs');
const path = require('path');

const files = [
    'src/features/gantt/domain/bars.ts',
    'src/features/gantt/domain/summaries.ts',
    'src/features/gantt/presentation/components/GanttChart.tsx',
    'src/features/gantt/presentation/components/TaskRow.tsx',
    'src/features/gantt/presentation/hooks/useGanttTimeline.ts',
    'src/features/scurve/domain/accumulation.ts',
    'src/features/scurve/domain/weighting.ts',
    'src/features/scurve/presentation/components/SCurveChart.tsx'
];

files.forEach(f => {
    const fullPath = path.join(__dirname, f);
    if (!fs.existsSync(fullPath)) {
        console.log('Skipping', f);
        return;
    }
    let s = fs.readFileSync(fullPath, 'utf8');

    // We want to capture the argument part and add `!` after the closing parenthesis.
    // The negative lookahead (?!\!) prevents adding multiple ! operators.
    s = s.replace(/parseDate\(([^)\n]+)\)(?!\!)/g, 'parseDate($1)!');

    // Fix up any double bangs that the user had manually, just in case
    s = s.replace(/!!/g, '!');

    fs.writeFileSync(fullPath, s);
});

console.log('Fixed dates files');
