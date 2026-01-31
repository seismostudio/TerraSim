import React, { useEffect, useRef } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';

interface MathProps {
    tex: string;
    block?: boolean;
}

export const MathRender: React.FC<MathProps> = ({ tex, block = false }) => {
    const containerRef = useRef<HTMLSpanElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            try {
                katex.render(tex, containerRef.current, {
                    displayMode: block,
                    throwOnError: false,
                });
            } catch (err) {
                console.error('KaTeX rendering error:', err);
                containerRef.current.textContent = tex;
            }
        }
    }, [tex, block]);

    return <span ref={containerRef} />;
};
