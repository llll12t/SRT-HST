'use client';

import { useRef, useCallback } from 'react';

interface UsePdfExportOptions {
    title?: string;
    pageSize?: 'A4' | 'A3';
    orientation?: 'portrait' | 'landscape';
    margin?: string;
    allowSVG?: boolean;
    fitToWidth?: boolean;
}

const defaultOptions: UsePdfExportOptions = {
    pageSize: 'A3',
    orientation: 'landscape',
    margin: '10mm',
    allowSVG: false,
    fitToWidth: false
};

export function usePdfExport(options: UsePdfExportOptions = {}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mergedOptions = { ...defaultOptions, ...options };

    const exportToPdf = useCallback(() => {
        if (!containerRef.current) return;

        const element = containerRef.current;
        const scrollContainer = element.querySelector('.overflow-auto') as HTMLElement;

        // Store original styles
        const originalStyles = {
            height: element.style.height,
            overflow: element.style.overflow,
            scrollHeight: scrollContainer?.style.height,
            scrollOverflow: scrollContainer?.style.overflow,
            scrollPosition: scrollContainer?.style.position
        };

        // Expand content for full capture
        element.style.height = 'auto';
        element.style.overflow = 'visible';
        if (scrollContainer) {
            scrollContainer.style.height = 'auto';
            scrollContainer.style.overflow = 'visible';
            scrollContainer.style.position = 'relative';
        }

        // Create print-specific styles
        const printStyles = document.createElement('style');
        printStyles.id = 'pdf-export-styles';
        printStyles.textContent = `
            @media print {
                @page {
                    size: ${mergedOptions.pageSize} ${mergedOptions.orientation};
                    margin: ${mergedOptions.margin};
                }
                
                /* Hide everything except target container */
                body * {
                    visibility: hidden;
                }
                
                #pdf-export-container,
                #pdf-export-container * {
                    visibility: visible;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    color-adjust: exact !important;
                }
                
                #pdf-export-container {
                    position: absolute;
                    left: 0;
                    top: 0;
                    width: 100%;
                }
                
                ${!mergedOptions.allowSVG ? `
                /* Hide dependency lines SVG */
                #pdf-export-container svg {
                    display: none !important;
                }
                ` : ''}
                
                /* Hide dependency dots */
                #pdf-export-container [title*="Link"] {
                    display: none !important;
                }
                
                /* Ensure background colors are printed */
                #pdf-export-container [class*="bg-"] {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                
                /* Force inline background colors */
                #pdf-export-container [style*="background"] {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }
                
                /* Hide toolbar elements with print-hide class */
                #pdf-export-container .print-hide,
                #pdf-export-container button,
                #pdf-export-container [class*="column-menu"],
                #pdf-export-container .relative.column-menu-trigger {
                    display: none !important;
                }
                
                /* Keep elements with print-show class visible */
                #pdf-export-container .print-show {
                    display: flex !important;
                }
            }
        `;
        document.head.appendChild(printStyles);

        // Add ID for print targeting
        element.id = 'pdf-export-container';

        // Small delay to ensure styles are applied and layout is calculated
        setTimeout(() => {
            // Calculate scale for fitToWidth
            if (mergedOptions.fitToWidth && scrollContainer) {
                const contentWidth = scrollContainer.scrollWidth;
                // Approximate printable width (A3 Landscape ~ 1500px, A4 ~ 1000px)
                const targetWidth = mergedOptions.pageSize === 'A3' ? 1500 : 1000;

                if (contentWidth > targetWidth) {
                    const rawScale = targetWidth / contentWidth;
                    // Limit minimum scale to 0.6 to prevent unreadable text
                    const scale = Math.max(rawScale, 0.6);

                    printStyles.textContent += `
                        @media print {
                            #pdf-export-container {
                                transform: scale(${scale});
                                transform-origin: top left;
                                width: ${contentWidth}px !important;
                                max-width: none !important;
                            }
                        }
                    `;
                }
            }

            window.print();

            // Restore original styles after print dialog
            setTimeout(() => {
                element.style.height = originalStyles.height;
                element.style.overflow = originalStyles.overflow;
                element.id = '';

                if (scrollContainer) {
                    scrollContainer.style.height = originalStyles.scrollHeight || '';
                    scrollContainer.style.overflow = originalStyles.scrollOverflow || '';
                    scrollContainer.style.position = originalStyles.scrollPosition || '';
                }

                // Remove print styles
                const printStyleEl = document.getElementById('pdf-export-styles');
                if (printStyleEl) printStyleEl.remove();
            }, 500);
        }, 500); // Increased delay for safety
    }, [mergedOptions.pageSize, mergedOptions.orientation, mergedOptions.margin, mergedOptions.allowSVG, mergedOptions.fitToWidth]);

    return {
        containerRef,
        exportToPdf
    };
}

export default usePdfExport;
