import React from 'react';
import { Line, Group } from 'react-konva';

interface ArrowProps {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    stroke?: string;
    strokeWidth?: number;
    headLength?: number;
    headAngle?: number;
    lineCap?: 'butt' | 'round' | 'square';
    lineJoin?: 'bevel' | 'round' | 'miter';
}

const Arrow: React.FC<ArrowProps> = ({ 
    x1, y1, x2, y2, 
    stroke = "#000", 
    strokeWidth = 1, 
    headLength = 8, 
    headAngle = Math.PI / 6,
    lineCap = "round",
    lineJoin = "round"
}) => {
    // Calculate arrow direction
    const angle = Math.atan2(y2 - y1, x1 - x2);
    
    // Calculate arrow head points
    const headAngle1 = angle + headAngle;
    const headAngle2 = angle - headAngle;
    
    const head1X = x1 - headLength * Math.cos(headAngle1);
    const head1Y = y1 + headLength * Math.sin(headAngle1);
    const head2X = x1 - headLength * Math.cos(headAngle2);
    const head2Y = y1 + headLength * Math.sin(headAngle2);
    
    return (
        <Group>
            {/* Arrow shaft */}
            <Line
                points={[x1, y1, x2, y2]}
                stroke={stroke}
                strokeWidth={strokeWidth}
                lineCap={lineCap}
            />
            {/* Arrow head */}
            <Line
                points={[head1X, head1Y, x1, y1, head2X, head2Y]}
                stroke={stroke}
                strokeWidth={strokeWidth}
                lineCap={lineCap}
                lineJoin={lineJoin}
            />
        </Group>
    );
};

export default Arrow; 