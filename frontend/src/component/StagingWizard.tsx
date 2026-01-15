import React, { useState, useRef, useEffect } from 'react';
import { Stage, Layer, Line, Circle, Text, Group } from 'react-konva';
import { useAppContext } from '../App';
import Arrow from './Arrow';
import { ChevronDown, ChevronDownIcon } from 'lucide-react';

interface Point {
    x: number;
    y: number;
}

interface Polygon {
    vertices: Point[];
    meshSize: number;
    boundaryRefinementFactor: number;
    id?: string;
    materialId?: string;
}

const StagingWizard: React.FC<{
    externalPolygonMode?: boolean;
    externalRectangleMode?: boolean;
    externalSelectMode?: boolean;
}> = ({ externalPolygonMode, externalRectangleMode, externalSelectMode }) => {
    let context;
    try {
        context = useAppContext();
    } catch (error) {
        console.error('MeshWizard context error:', error);
        return (
            <div className="flex items-center justify-center w-full h-full text-red-500">
                <div className="text-center">
                    <div className="text-lg font-semibold mb-2">Context Error</div>
                    <div className="text-sm">Unable to access application context.</div>
                    <div className="text-xs mt-2">Please refresh the page and try again.</div>
                </div>
            </div>
        );
    }

    const { 
        polygons, 
        materialList,
        // General settings
        showGrid,
        gridSize,
        showAxis,
        showAxisLabels,
        pointLoadList,
        selectedPolygonId,
        setSelectedPolygonId,
        selectedPointLoadId,
        setSelectedPointLoadId,
        // Water level context
        waterLevelList,
        selectedWaterLevelId,
        setSelectedWaterLevelId,
        // Stage management
        saveStages,
        getStages,

    } = context;

    
    const [isRectangleMode, setIsRectangleMode] = useState(false);
    const [isPolygonMode, setIsPolygonMode] = useState(false);
    const [isSelectMode, setIsSelectMode] = useState(true);
    
    // Use external polygon mode if provided, otherwise use local state
    const effectivePolygonMode = externalPolygonMode !== undefined ? externalPolygonMode : isPolygonMode;
    // Use external rectangle mode if provided, otherwise use local state
    const effectiveRectangleMode = externalRectangleMode !== undefined ? externalRectangleMode : isRectangleMode;

    // Canvas dimensions and viewport - EXACTLY like InputCanvas
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasWidth, setCanvasWidth] = useState(1500);
    const [canvasHeight, setCanvasHeight] = useState(1000);
    const padding = 20;
    const baseViewportMinX = -20;
    const baseViewportMaxX = 20;
    const baseViewportMinY = -20;
    const baseViewportMaxY = 20;

    // Update canvas dimensions based on container size
    useEffect(() => {
        const updateCanvasSize = () => {
            if (containerRef.current) {
                const container = containerRef.current;
                const rect = container.getBoundingClientRect();
                setCanvasWidth(rect.width);
                setCanvasHeight(rect.height);
            }
        };

        updateCanvasSize();
        window.addEventListener('resize', updateCanvasSize);
        
        return () => {
            window.removeEventListener('resize', updateCanvasSize);
        };
    }, []);

    // Control info panel animation
    useEffect(() => {
        if (selectedPolygonId || selectedPointLoadId || selectedWaterLevelId) {
            setShowInfoPanel(true);
        } else {
            setShowInfoPanel(false);
        }
    }, [selectedPolygonId, selectedPointLoadId, selectedWaterLevelId]);


    // Calculate base scale - EXACTLY like InputCanvas
    const baseScaleX = (canvasWidth - 2 * padding) / (baseViewportMaxX - baseViewportMinX);
    const baseScaleY = (canvasHeight - 2 * padding) / (baseViewportMaxY - baseViewportMinY);
    const baseScale = Math.min(baseScaleX, baseScaleY);

    // Viewport state - EXACTLY like InputCanvas
    const [viewport, setViewport] = useState({
        scale: 1,
        x: 0,
        y: 0
    });

    // Canvas state
    const [mousePosition, setMousePosition] = useState<Point | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point | null>(null);
    const [showInfoPanel, setShowInfoPanel] = useState(false);
    
    // Staging system state
    const [stages, setStages] = useState<Array<{
        id: string;
        name: string;
        activePolygons: string[];
        activePointLoads: string[];
        activeWaterLevels: string[];
        calculationType: 'FEA' | 'K0';
    }>>(() => getStages());
    const [selectedStageId, setSelectedStageId] = useState<string>('initial');
    const [expandedStageId, setExpandedStageId] = useState<string | null>(null);

    const stageRef = useRef<any>(null);


    // Convert world coordinates to stage coordinates - EXACTLY like InputCanvas
    const worldToStage = (worldX: number, worldY: number) => {
        const stageX = padding + (worldX - baseViewportMinX) * baseScale * viewport.scale + viewport.x;
        const stageY = canvasHeight - padding - (worldY - baseViewportMinY) * baseScale * viewport.scale + viewport.y;
        return { x: stageX, y: stageY };
    };

    // Convert stage coordinates to world coordinates - EXACTLY like InputCanvas
    const stageToWorld = (stageX: number, stageY: number) => {
        const worldX = baseViewportMinX + (stageX - padding - viewport.x) / (baseScale * viewport.scale);
        const worldY = baseViewportMinY + (canvasHeight - padding - stageY + viewport.y) / (baseScale * viewport.scale);
        return { x: worldX, y: worldY };
    };

    // Function to check if a point is inside a polygon
    const isPointInPolygon = (point: Point, polygon: Polygon): boolean => {
        const vertices = polygon.vertices;
        if (vertices.length < 3) return false;
        
        console.log('Checking point-in-polygon:', point, 'for polygon with', vertices.length, 'vertices');
        
        let inside = false;
        for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
            const xi = vertices[i].x;
            const yi = vertices[i].y;
            const xj = vertices[j].x;
            const yj = vertices[j].y;
            
            if (((yi > point.y) !== (yj > point.y)) && 
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }
        
        console.log('Point-in-polygon result:', inside);
        return inside;
    };

    // Function to find polygon at a given point
    const findPolygonAtPoint = (point: Point): string | null => {
        for (let i = polygons.length - 1; i >= 0; i--) {
            if (isPointInPolygon(point, polygons[i])) {
                return polygons[i].id || `polygon_${i}`;
            }
        }
        return null;
    };

    // Function to find point load at a given point
    const findPointLoadAtPoint = (point: Point): string | null => {
        const clickRadius = 0.5; // Radius in world coordinates for click detection
        for (let i = pointLoadList.length - 1; i >= 0; i--) {
            const pointLoad = pointLoadList[i];
            const distance = Math.sqrt(
                Math.pow(point.x - pointLoad.x, 2) + 
                Math.pow(point.y - pointLoad.y, 2)
            );
            if (distance <= clickRadius) {
                return pointLoad.id;
            }
        }
        return null;
    };

    // Function to find water level at a given point
    const findWaterLevelAtPoint = (point: Point): string | null => {
        const clickRadius = 0.5; // Radius in world coordinates for click detection
        for (let i = waterLevelList.length - 1; i >= 0; i--) {
            const waterLevel = waterLevelList[i];
            // Check if point is near any segment of the water level
            for (let j = 0; j < waterLevel.points.length - 1; j++) {
                const p1 = waterLevel.points[j];
                const p2 = waterLevel.points[j + 1];
                
                // Calculate distance from point to line segment
                const distance = distanceToLineSegment(point, p1, p2);
                if (distance <= clickRadius) {
                    return waterLevel.id;
                }
            }
        }
        return null;
    };

    // Helper function to calculate distance from point to line segment
    const distanceToLineSegment = (point: Point, p1: Point, p2: Point): number => {
        const A = point.x - p1.x;
        const B = point.y - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
            xx = p1.x;
            yy = p1.y;
        } else if (param > 1) {
            xx = p2.x;
            yy = p2.y;
        } else {
            xx = p1.x + param * C;
            yy = p1.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;
        return Math.sqrt(dx * dx + dy * dy);
    };
    
    // Mouse handlers - EXACTLY like InputCanvas
    const handleMouseDown = (e: any) => {
        const stage = e.target.getStage();
        const pointerPos = stage.getPointerPosition();

        // Handle panning with middle mouse button or Ctrl+left click
        if (e.evt.button === 1 || (e.evt.button === 0 && e.evt.ctrlKey)) {
            e.evt.preventDefault();
            setIsPanning(true);
            setPanStart(pointerPos);
            return;
        }

        // Handle select mode
        if (e.evt.button === 0 && !e.evt.ctrlKey && isSelectMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            
            // First check if clicking on a water level
            const clickedWaterLevelId = findWaterLevelAtPoint(worldPoint);
            if (clickedWaterLevelId) {
                setSelectedWaterLevelId(clickedWaterLevelId);
                setSelectedPolygonId(null); // Clear polygon selection
                setSelectedPointLoadId(null); // Clear point load selection
                return;
            }
            
            // Then check if clicking on a point load
            const clickedPointLoadId = findPointLoadAtPoint(worldPoint);
            if (clickedPointLoadId) {
                setSelectedPointLoadId(clickedPointLoadId);
                setSelectedPolygonId(null); // Clear polygon selection
                setSelectedWaterLevelId(null); // Clear water level selection
                return;
            }
            
            // If not clicking on water level or point load, check for polygon
            const clickedPolygonId = findPolygonAtPoint(worldPoint);
            setSelectedPolygonId(clickedPolygonId);
            setSelectedPointLoadId(null); // Clear point load selection
            setSelectedWaterLevelId(null); // Clear water level selection
            return;
        }

        // Clear selection if clicking on empty area in select mode
        if (isSelectMode && !effectivePolygonMode && !effectiveRectangleMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const clickedPolygonId = findPolygonAtPoint(worldPoint);
            const clickedPointLoadId = findPointLoadAtPoint(worldPoint);
            if (!clickedPolygonId && !clickedPointLoadId) {
                setSelectedPolygonId(null);
                setSelectedPointLoadId(null);
            }
        }
    };

    const handleMouseMove = (e: any) => {
        const stage = e.target.getStage();
        const pointerPos = stage.getPointerPosition();
        
        // Handle panning
        if (isPanning && panStart) {
            const deltaX = pointerPos.x - panStart.x;
            const deltaY = pointerPos.y - panStart.y;
            
            setViewport(prev => ({
                ...prev,
                x: prev.x + deltaX,
                y: prev.y + deltaY
            }));
            
            setPanStart(pointerPos);
            return;
        }

        // Update mouse position for coordinate display
        const worldPos = stageToWorld(pointerPos.x, pointerPos.y);
        setMousePosition(worldPos);
    };

    const handleMouseUp = () => {
        setIsPanning(false);
        setPanStart(null);
    };

    const handleWheel = (e: any) => {
        e.evt.preventDefault();
        
        const stage = e.target.getStage();
        const pointerPos = stage.getPointerPosition();
        
        // Get current world position under mouse
        const worldPos = stageToWorld(pointerPos.x, pointerPos.y);
        
        // Calculate new scale
        const scaleBy = 1.1;
        const newScale = e.evt.deltaY > 0 ? viewport.scale / scaleBy : viewport.scale * scaleBy;
            
        // Limit scale
        const minScale = 0.1;
        const maxScale = 10;
        const clampedScale = Math.max(minScale, Math.min(maxScale, newScale));
            
        // Calculate new translation to keep world point under mouse fixed
        const newX = pointerPos.x - (worldPos.x - baseViewportMinX) * baseScale * clampedScale - padding;
        const newY = pointerPos.y + (worldPos.y - baseViewportMinY) * baseScale * clampedScale - canvasHeight + padding;
        
        setViewport({
            scale: clampedScale,
            x: newX,
            y: newY
        });
    };

    const resetView = () => {
        setViewport({
            scale: 1,
            x: 0,
            y: 0
        });
    };

    // Stage management functions
    const addNewStage = () => {
        const newStageId = `stage_${Date.now()}`;
        const newStage = {
            id: newStageId,
            name: `Stage ${stages.length}`,
            activePolygons: [],
            activePointLoads: [],
            activeWaterLevels: [],
            calculationType: 'FEA' as const,
            useMStage: false,
            maxIncrements: 20,
            mstageIncrement: 0.1,
            convergenceTolerance: 0.001
        };
        const updatedStages = [...stages, newStage];
        setStages(updatedStages);
        saveStages(updatedStages);
        setSelectedStageId(newStageId);
    };

    const deleteStage = (stageId: string) => {
        if (stageId === 'initial') return; // Cannot delete initial stage
        const updatedStages = stages.filter(stage => stage.id !== stageId);
        setStages(updatedStages);
        saveStages(updatedStages);
        if (selectedStageId === stageId) {
            setSelectedStageId('initial');
        }
    };

    const updateStageName = (stageId: string, newName: string) => {
        const updatedStages = stages.map(stage => 
            stage.id === stageId ? { ...stage, name: newName } : stage
        );
        setStages(updatedStages);
        saveStages(updatedStages);
    };

    const updateStageCalculationType = (stageId: string, calculationType: 'FEA' | 'K0') => {
        const updatedStages = stages.map(stage => 
            stage.id === stageId ? { ...stage, calculationType } : stage
        );
        setStages(updatedStages);
        saveStages(updatedStages);
    };



    const togglePolygonInStage = (stageId: string, polygonId: string) => {
        const updatedStages = stages.map(stage => {
            if (stage.id === stageId) {
                const isActive = stage.activePolygons.includes(polygonId);
                return {
                    ...stage,
                    activePolygons: isActive 
                        ? stage.activePolygons.filter(id => id !== polygonId)
                        : [...stage.activePolygons, polygonId]
                };
            }
            return stage;
        });
        setStages(updatedStages);
        saveStages(updatedStages);
    };

    const togglePointLoadInStage = (stageId: string, pointLoadId: string) => {
        const updatedStages = stages.map(stage => {
            if (stage.id === stageId) {
                const isActive = stage.activePointLoads.includes(pointLoadId);
                return {
                    ...stage,
                    activePointLoads: isActive 
                        ? stage.activePointLoads.filter(id => id !== pointLoadId)
                        : [...stage.activePointLoads, pointLoadId]
                };
            }
            return stage;
        });
        setStages(updatedStages);
        saveStages(updatedStages);
    };

    const toggleWaterLevelInStage = (stageId: string, waterLevelId: string) => {
        const updatedStages = stages.map(stage => {
            if (stage.id === stageId) {
                const isActive = stage.activeWaterLevels.includes(waterLevelId);
                // If activating this water level, deactivate all others (only one active at a time)
                if (!isActive) {
                    return {
                        ...stage,
                        activeWaterLevels: [waterLevelId] // Only this one active
                    };
                } else {
                    return {
                        ...stage,
                        activeWaterLevels: [] // Deactivate all
                    };
                }
            }
            return stage;
        });
        setStages(updatedStages);
        saveStages(updatedStages);
    };

    // ✅ REMOVED: Manual element toggle functions - NOT NEEDED!
    // Element active status is AUTOMATIC based on polygon activation

    const getSelectedStage = () => {
        return stages.find(stage => stage.id === selectedStageId);
    };

    const getMaterialColor = (materialId: string | undefined) => {
        if (!materialId) return '#666'; // Default gray for unassigned materials
        const material = materialList.find(m => m.id === materialId);
        return material ? material.color : '#666';
    };

    // Generate grid lines based on current viewport - EXACTLY like InputCanvas
    const generateGridLines = () => {
        const lines = [];
        
        // Calculate current viewport bounds in world coordinates
        const currentViewportMinX = stageToWorld(0, 0).x;
        const currentViewportMaxX = stageToWorld(canvasWidth, 0).x;
        const currentViewportMinY = stageToWorld(0, canvasHeight).y;
        const currentViewportMaxY = stageToWorld(0, 0).y;
        
        // Adaptive grid spacing based on zoom level - EXACTLY like InputCanvas
        let gridSpacing = gridSize; // Use gridSize from context
        if (viewport.scale < 0.5) gridSpacing = 2;
        else if (viewport.scale < 1) gridSpacing = 1;
        else if (viewport.scale < 2) gridSpacing = 0.5;
        else if (viewport.scale < 5) gridSpacing = 0.2;
        else gridSpacing = 0.1;
        
        // Vertical lines
        const startX = Math.floor(currentViewportMinX / gridSpacing) * gridSpacing;
        const endX = Math.ceil(currentViewportMaxX / gridSpacing) * gridSpacing;
        for (let x = startX; x <= endX; x += gridSpacing) {
            const startPos = worldToStage(x, currentViewportMinY);
            const endPos = worldToStage(x, currentViewportMaxY);
            lines.push([startPos.x, startPos.y, endPos.x, endPos.y]);
        }
        
        // Horizontal lines
        const startY = Math.floor(currentViewportMinY / gridSpacing) * gridSpacing;
        const endY = Math.ceil(currentViewportMaxY / gridSpacing) * gridSpacing;
        for (let y = startY; y <= endY; y += gridSpacing) {
            const startPos = worldToStage(currentViewportMinX, y);
            const endPos = worldToStage(currentViewportMaxX, y);
            lines.push([startPos.x, startPos.y, endPos.x, endPos.y]);
        }
        
        return lines;
    };

    // Generate axis lines based on current viewport - EXACTLY like InputCanvas
    const generateAxisLines = () => {
        const lines = [];
        
        // Calculate current viewport bounds in world coordinates
        const currentViewportMinX = stageToWorld(0, 0).x;
        const currentViewportMaxX = stageToWorld(canvasWidth, 0).x;
        const currentViewportMinY = stageToWorld(0, canvasHeight).y;
        const currentViewportMaxY = stageToWorld(0, 0).y;
        
        // X-axis (horizontal line at y=0)
        const xAxisStart = worldToStage(currentViewportMinX, 0);
        const xAxisEnd = worldToStage(currentViewportMaxX, 0);
        lines.push([xAxisStart.x, xAxisStart.y, xAxisEnd.x, xAxisEnd.y]);
        
        // Y-axis (vertical line at x=0)
        const yAxisStart = worldToStage(0, currentViewportMinY);
        const yAxisEnd = worldToStage(0, currentViewportMaxY);
        lines.push([yAxisStart.x, yAxisStart.y, yAxisEnd.x, yAxisEnd.y]);
        
        return lines;
    };

    // Generate axis ticks based on current viewport - EXACTLY like InputCanvas
    const generateAxisTicks = () => {
        const ticks = [];
        
        // Calculate current viewport bounds in world coordinates
        const currentViewportMinX = stageToWorld(0, 0).x;
        const currentViewportMaxX = stageToWorld(canvasWidth, 0).x;
        const currentViewportMinY = stageToWorld(0, canvasHeight).y;
        const currentViewportMaxY = stageToWorld(0, 0).y;
        
        // Adaptive tick spacing based on zoom level - EXACTLY like InputCanvas
        let tickSpacing = 1;
        if (viewport.scale < 0.5) tickSpacing = 5;
        else if (viewport.scale < 1) tickSpacing = 2;
        else if (viewport.scale < 2) tickSpacing = 1;
        else if (viewport.scale < 5) tickSpacing = 0.5;
        else tickSpacing = 0.2;
        
        // Helper function to format tick labels - EXACTLY like InputCanvas
        const formatTickLabel = (value: number): string => {
            // Round to avoid floating point precision issues
            const rounded = Math.round(value * 1000000) / 1000000;
            
            // Determine decimal places based on tick spacing
            let decimalPlaces = 0;
            if (tickSpacing < 1) {
                if (tickSpacing >= 0.5) decimalPlaces = 1;
                else if (tickSpacing >= 0.1) decimalPlaces = 2;
                else decimalPlaces = 3;
            }
            
            // Format the number
            return rounded.toFixed(decimalPlaces);
        };
        
        // X-axis ticks
        const startX = Math.ceil(currentViewportMinX / tickSpacing) * tickSpacing;
        const endX = Math.floor(currentViewportMaxX / tickSpacing) * tickSpacing;
        for (let x = startX; x <= endX; x += tickSpacing) {
            if (Math.abs(x) < 0.01) continue; // Skip origin (very small tolerance)
            const tickPos = worldToStage(x, 0);
            ticks.push({
                x: tickPos.x,
                y: 5,
                text: formatTickLabel(x),
                anchor: 'center'
            });
        }
        
        // Y-axis ticks
        const startY = Math.ceil(currentViewportMinY / tickSpacing) * tickSpacing;
        const endY = Math.floor(currentViewportMaxY / tickSpacing) * tickSpacing;
        for (let y = startY; y <= endY; y += tickSpacing) {
            if (Math.abs(y) < 0.01) continue; // Skip origin (very small tolerance)
            const tickPos = worldToStage(0, y);
            ticks.push({
                x: 5,
                y: tickPos.y,
                text: formatTickLabel(y),
                anchor: 'center'
            });
        }
        
        return ticks;
    };

    // Function to render point loads on the canvas - EXACTLY like InputCanvas
    const renderPointLoads = () => {
        const selectedStage = getSelectedStage();
        const activePointLoads = selectedStage?.activePointLoads || [];
        
        return pointLoadList.map((pointLoad) => {
            const pos = worldToStage(pointLoad.x, pointLoad.y);
            const isSelected = selectedPointLoadId === pointLoad.id;
            const isActive = activePointLoads.includes(pointLoad.id);
            
            // Check for valid coordinates
            if (isNaN(pos.x) || isNaN(pos.y)) {
                console.warn(`Invalid coordinates for point load ${pointLoad.id}:`, { x: pointLoad.x, y: pointLoad.y, pos });
                return null;
            }

            // Calculate arrow properties
            const arrowLength = 20; // Fixed length for consistent arrow height
            
            // Calculate arrow end point
            const endX = pos.x - (pointLoad.fx / Math.sqrt(pointLoad.fx * pointLoad.fx + pointLoad.fy * pointLoad.fy)) * arrowLength;
            const endY = pos.y + (pointLoad.fy / Math.sqrt(pointLoad.fx * pointLoad.fx + pointLoad.fy * pointLoad.fy)) * arrowLength;

            // Determine colors based on selection and activity status
            const circleFill = isSelected ? "#ff0000" : (isActive ? "#ff6b6b" : "#d3d3d3");
            const circleStroke = isSelected ? "#ff0000" : (isActive ? "#d63031" : "#a0a0a0");
            const arrowStroke = isSelected ? "#ff0000" : (isActive ? "#d63031" : "#a0a0a0");

            return (
                <Group key={`pointload-${pointLoad.id}`}>
                    {/* Point load circle */}
                    <Circle
                        x={pos.x}
                        y={pos.y}
                        radius={isSelected ? 3 : 1}
                        fill={circleFill}
                        stroke={circleStroke}
                        strokeWidth={isSelected ? 3 : 2}
                    />
                    
                    {/* Force vector arrow */}
                    <Arrow
                        x1={pos.x}
                        y1={pos.y}
                        x2={endX}
                        y2={endY}
                        stroke={arrowStroke}
                        strokeWidth={isSelected ? 3 : 2}
                        headLength={isSelected ? 10 : 8}
                        headAngle={Math.PI / 6}
                    />

                </Group>
            );
        });
    };

    // Function to render water levels on the canvas
    const renderWaterLevels = () => {
        const selectedStage = getSelectedStage();
        const activeWaterLevels = selectedStage?.activeWaterLevels || [];
        
        return waterLevelList.map((waterLevel) => {
            const isSelected = selectedWaterLevelId === waterLevel.id;
            const isActive = activeWaterLevels.includes(waterLevel.id);
            
            // Convert points to stage coordinates
            const stagePoints = waterLevel.points.map(point => {
                const pos = worldToStage(point.x, point.y);
                return [pos.x, pos.y];
            }).flat();

            // Determine colors based on selection and activity status
            const lineColor = isSelected ? "#ff0000" : (isActive ? "#0066cc" : "#d3d3d3");
            const pointColor = isSelected ? "#ff0000" : (isActive ? "#0066cc" : "#a0a0a0");

            return (
                <Group key={`waterlevel-${waterLevel.id}`}>
                    {/* Water level line */}
                    <Line
                        points={stagePoints}
                        stroke={lineColor}
                        strokeWidth={isSelected ? 4 : (isActive ? 2 : 1)}
                        lineCap="round"
                        lineJoin="round"
                    />
                    
                    {/* Water level points */}
                    {waterLevel.points.map((point, index) => {
                        const pos = worldToStage(point.x, point.y);
                        return (
                            <Circle
                                key={`waterlevel-point-${waterLevel.id}-${index}`}
                                x={pos.x}
                                y={pos.y}
                                radius={isSelected ? 4 : (isActive ? 2 : 1)}
                                fill={pointColor}
                                stroke={pointColor}
                                strokeWidth={isSelected ? 2 : 1}
                            />
                        );
                    })}
                </Group>
            );
        });
    };


    return (
        <div className="flex flex-row h-full w-full">
            {/* Left Panel - Stage Phases */}
            <div className="w-1/5 border-r border-gray-200 overflow-y-auto">
                <div className="space-y-2">
                    {/* Stage Phases Section */}
                    <div>
                        <div className="flex items-center justify-between p-3 border-b border-gray-200">
                            <h4 className="text-base font-semibold text-gray-800">
                            Stage Phases
                        </h4>
                            <button
                                onClick={addNewStage}
                                className="bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 transition-colors"
                                title="Add New Stage"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                </svg>
                            </button>
                        </div>
                        
                        <div className="space-y-2 p-3">
                            {/* Stages List */}
                            {stages.map((stage) => (
                                <div 
                                    key={stage.id}
                                    className={`border transition-colors ${
                                        selectedStageId === stage.id 
                                            ? 'border-gray-500 bg-gray-200' 
                                            : 'border-gray-300 hover:border-gray-400'
                                    }`}
                                >
                                    <div 
                                        className="p-3 cursor-pointer"
                                        onClick={() => setSelectedStageId(stage.id)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-medium text-gray-800">
                                                    {stage.name}
                                                </span>
                                                <span className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">
                                                    {stage.calculationType}
                                        </span>
                                    </div>
                                            <div className="flex items-center gap-1">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setExpandedStageId(expandedStageId === stage.id ? null : stage.id);
                                                    }}
                                                    className="text-gray-500 hover:text-gray-700 text-xs"
                                                    title="Stage Settings"
                                                >
                                                    <ChevronDownIcon className="w-4 h-4" />
                                                </button>
                                                {stage.id !== 'initial' && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            deleteStage(stage.id);
                                                        }}
                                                        className="text-red-500 hover:text-red-700 text-xs"
                                                        title="Delete Stage"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                )}
                                </div>                            
                            </div>
                                    </div>

                                    {/* Stage Settings Dropdown */}
                                    {expandedStageId === stage.id && (
                                        <div className="border-t border-gray-200 p-3 bg-gray-50">
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Stage Name
                                                    </label>
                                                    <input
                                                        type="text"
                                                        value={stage.name}
                                                        onChange={(e) => updateStageName(stage.id, e.target.value)}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                                        Calculation Type
                                                    </label>
                                                    <select
                                                        value={stage.calculationType}
                                                        onChange={(e) => updateStageCalculationType(stage.id, e.target.value as 'FEA' | 'K0')}
                                                        className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                                    >
                                                        <option value="FEA">FEA (Finite Element Analysis)</option>
                                                        <option value="K0">K0 (At-Rest Earth Pressure)</option>
                                                    </select>
                                                </div>
                                                

                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Polygon Info */}
                    <div className="p-3">
                        {polygons.length === 0 && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
                                <p className="text-sm text-yellow-700">
                                    No polygons available. Please create polygons in the Input Wizard first.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Center Panel - Mesh Preview Canvas */}
            <div ref={containerRef} className="flex-1 relative w-4/5 h-full">
                {/* Controls - EXACTLY like InputCanvas */}
                <div className="flex flex-row text-xs items-center gap-2 p-2">
                    <button
                        onClick={resetView} 
                        className="bg-gray-500 text-white border-none px-2 py-1 rounded-md mr-2">
                        Reset View
                    </button>
                    <h5 className="text-sm font-medium text-gray-700">
                        Selected Stage: {getSelectedStage()?.name}
                    </h5>
                    <span className="text-xs text-gray-500">Zoom: {(viewport.scale * 100).toFixed(0)}%</span>
                    {/* Mouse Coordinates */}
                    {mousePosition && (
                        <div className="bg-gray-100 rounded">
                            <p className="text-xs text-gray-500">
                                | Mouse: ({mousePosition.x.toFixed(2)}, {mousePosition.y.toFixed(2)})
                            </p>
                        </div>
                    )}
                </div>
                
                {/* Konva Stage - EXACTLY like InputCanvas */}
                <Stage
                    ref={stageRef}
                    width={canvasWidth}
                    height={canvasHeight}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onWheel={handleWheel}
                    tabIndex={0}
                    style={{ border: '1px solid #ccc', background: '#f9f9f9' }}
                >
                    <Layer>
                        {/* Grid Lines - EXACTLY like InputCanvas */}
                        {showGrid && generateGridLines().map((line, index) => (
                            <Line
                                key={`grid-${index}`}
                                points={line}
                                stroke="#e0e0e0"
                                strokeWidth={0.5}
                            />
                        ))}

                        {/* Axis Lines - EXACTLY like InputCanvas */}
                        {showAxis && generateAxisLines().map((line, index) => (
                            <Line
                                key={`axis-${index}`}
                                points={line}
                                stroke="#666"
                                strokeWidth={1}
                            />
                        ))}

                        {/* Axis Ticks - EXACTLY like InputCanvas */}
                        {showAxisLabels && generateAxisTicks().map((tick, index) => (
                            <Text
                                key={`tick-${index}`}
                                x={tick.x}
                                y={tick.y}
                                text={tick.text}
                                fontSize={10}
                                fill="#666"
                                align="center"
                            />
                        ))}
                        
                        {/* Polygons */}
                        {/* Non-selected Polygons (rendered first - lower z-index) */}
                        {polygons.map((polygon: Polygon, polygonIndex: number) => {
                            const isSelected = selectedPolygonId === (polygon.id || `polygon_${polygonIndex}`);
                            const selectedStage = getSelectedStage();
                            const isActive = selectedStage?.activePolygons.includes(polygon.id || `polygon_${polygonIndex}`) || false;
                            
                            if (!isSelected) {
                                return (
                                    <Group key={`polygon-${polygonIndex}`}>
                                        {/* Polygon Fill */}
                                        <Line
                                            points={polygon.vertices.flatMap(vertex => {
                                                const pos = worldToStage(vertex.x, vertex.y);
                                                return [pos.x, pos.y];
                                            })}
                                            fill={isActive ? getMaterialColor(polygon.materialId) : "#d3d3d3"}
                                            stroke={isActive ? getMaterialColor(polygon.materialId) : "#a0a0a0"}
                                            strokeWidth={2}
                                            closed={true}
                                            opacity={isActive ? 0.3 : 0.1}
                                        />
                                        
                                        {/* Polygon Lines */}
                                        {polygon.vertices.map((vertex: Point, vertexIndex: number) => {
                                            if (vertexIndex < polygon.vertices.length - 1) {
                                                const currentPos = worldToStage(vertex.x, vertex.y);
                                                const nextPos = worldToStage(polygon.vertices[vertexIndex + 1].x, polygon.vertices[vertexIndex + 1].y);
                                                return (
                                                    <Line
                                                        key={`line-${polygonIndex}-${vertexIndex}`}
                                                        points={[currentPos.x, currentPos.y, nextPos.x, nextPos.y]}
                                                        stroke={isActive ? getMaterialColor(polygon.materialId) : "#a0a0a0"}
                                                        strokeWidth={2}
                                                    />
                                                    );
                                                }
                                            return null;
                                        })}
                            
                                        {/* Polygon Vertices */}
                                        {polygon.vertices.map((vertex, vertexIndex) => {
                                            const pos = worldToStage(vertex.x, vertex.y);
                                            return (
                                                <Circle
                                                    key={`vertex-${polygonIndex}-${vertexIndex}`}
                                                    x={pos.x}
                                                    y={pos.y}
                                                    radius={3}
                                                    fill={isActive ? getMaterialColor(polygon.materialId) : "#a0a0a0"}
                                                />
                                            );
                                        })}
                                    </Group>
                                );
                            }
                            return null;
                        })}

                        {/* Selected Polygon (rendered last - higher z-index) */}
                        {polygons.map((polygon: Polygon, polygonIndex: number) => {
                            const isSelected = selectedPolygonId === (polygon.id || `polygon_${polygonIndex}`);
                            if (isSelected) {
                                return (
                                    <Group key={`selected-polygon-${polygonIndex}`}>
                                        {/* Selected Polygon Fill with highlight */}
                                        <Line
                                            points={polygon.vertices.flatMap(vertex => {
                                                const pos = worldToStage(vertex.x, vertex.y);
                                                return [pos.x, pos.y];
                                            })}
                                            fill={getMaterialColor(polygon.materialId)}
                                            stroke="#ff6b6b"
                                            strokeWidth={4}
                                            closed={true}
                                            opacity={0.4}
                                        />
                                        
                                        {/* Polygon Lines */}
                                        {polygon.vertices.map((vertex: Point, vertexIndex: number) => {
                                            if (vertexIndex < polygon.vertices.length - 1) {
                                                const currentPos = worldToStage(vertex.x, vertex.y);
                                                const nextPos = worldToStage(polygon.vertices[vertexIndex + 1].x, polygon.vertices[vertexIndex + 1].y);
                                                return (
                                                    <Line
                                                        key={`selected-line-${polygonIndex}-${vertexIndex}`}
                                                        points={[currentPos.x, currentPos.y, nextPos.x, nextPos.y]}
                                                        stroke="#ff6b6b"
                                                        strokeWidth={4}
                                                    />
                                                );
                                            }
                                            return null;
                                        })}
                                        
                                        {/* Polygon Vertices */}
                                        {polygon.vertices.map((vertex, vertexIndex) => {
                                            const pos = worldToStage(vertex.x, vertex.y);
                                            return (
                                                <Circle
                                                    key={`selected-vertex-${polygonIndex}-${vertexIndex}`}
                                                    x={pos.x}
                                                    y={pos.y}
                                                    radius={5}
                                                    fill="#ff6b6b"
                                                />
                                            );
                                        })}
                                    </Group>
                                );
                            }
                            return null;
                        })}

                        {/* Water Levels */}
                        {renderWaterLevels()}

                        {/* Point Loads */}
                        {renderPointLoads()}
                    </Layer>
                </Stage>

                {/* Canvas Instructions */}
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded text-sm">
                    <p>Mouse wheel: Zoom | Middle/Right click: Pan</p>
                </div>
            </div>

            {/* Right Panel - Object Information (fixed overlay) */}
            <div className={`fixed top-0 right-0 w-1/5 h-full bg-white shadow-lg border-l border-gray-200 overflow-y-auto z-50 transform transition-transform duration-300 ease-in-out ${
                showInfoPanel ? 'translate-x-0' : 'translate-x-full'
            }`}>
                {(selectedPolygonId || selectedPointLoadId || selectedWaterLevelId) && (
                    <div className="p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-gray-800">
                                {selectedPolygonId ? 'Polygon Details' : selectedPointLoadId ? 'Point Load Details' : 'Water Level Details'}
                            </h3>
                            <button
                                onClick={() => {
                                    setSelectedPolygonId(null);
                                    setSelectedPointLoadId(null);
                                    setSelectedWaterLevelId(null);
                                }}
                                className="text-gray-500 hover:text-gray-700"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>



                        {/* Polygon Information */}
                        {selectedPolygonId && (() => {
                            const selectedPolygon = polygons.find(p => (p.id || `polygon_${polygons.indexOf(p)}`) === selectedPolygonId);
                            if (!selectedPolygon) return null;

                            const material = materialList.find(m => m.id === selectedPolygon.materialId);
                            const selectedStage = getSelectedStage();
                            const isActiveInStage = selectedStage?.activePolygons.includes(selectedPolygonId) || false;
                            
                            return (
                                <div className="space-y-4">
                                    {/* Stage Activation Control */}
                                    {selectedStage && (
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                            <h4 className="font-medium text-blue-800 mb-2">Stage Control</h4>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-blue-700">Active in {selectedStage.name}:</span>
                                                    <button
                                                        onClick={() => togglePolygonInStage(selectedStage.id, selectedPolygonId)}
                                                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                                            isActiveInStage
                                                                ? 'bg-green-500 text-white hover:bg-green-600'
                                                                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                                                        }`}
                                                    >
                                                        {isActiveInStage ? 'Active' : 'Inactive'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Basic Info */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Basic Information</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">ID:</span>
                                                <span className="font-mono">{selectedPolygonId}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Vertices:</span>
                                                <span>{selectedPolygon.vertices.length}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Mesh Size:</span>
                                                <span>{selectedPolygon.meshSize} m</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Boundary Refinement:</span>
                                                <span>{selectedPolygon.boundaryRefinementFactor}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Material Information */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Material</h4>
                                        {material ? (
                                            <div className="space-y-2 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Name:</span>
                                                    <span>{material.name}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Color:</span>
                                                    <div className="flex items-center gap-2">
                                                        <div 
                                                            className="w-4 h-4 rounded border border-gray-300"
                                                            style={{ backgroundColor: material.color }}
                                                        ></div>
                                                        <span>{material.color}</span>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">E (Young's Modulus):</span>
                                                    <span>{material.youngsModulus.toExponential(2)} Pa</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">ν (Poisson's Ratio):</span>
                                                    <span>{material.poissonsRatio}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">γ (Unit Weight):</span>
                                                    <span>γsat: {material.unitWeightSaturated} kN/m³ | γunsat: {material.unitWeightUnsaturated} kN/m³</span>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="text-sm text-gray-500">
                                                No material assigned
                                            </div>
                                        )}
                                    </div>

                                    {/* Vertex Coordinates */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Vertex Coordinates</h4>
                                        <div className="max-h-32 overflow-y-auto">
                                            {selectedPolygon.vertices.map((vertex, index) => (
                                                <div key={index} className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">V{index}:</span>
                                                    <span className="font-mono">
                                                        ({vertex.x.toFixed(2)}, {vertex.y.toFixed(2)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Point Load Information */}
                        {selectedPointLoadId && (() => {
                            const selectedPointLoad = pointLoadList.find(pl => pl.id === selectedPointLoadId);
                            if (!selectedPointLoad) return null;

                            const magnitude = Math.sqrt(selectedPointLoad.fx * selectedPointLoad.fx + selectedPointLoad.fy * selectedPointLoad.fy);
                            const angle = Math.atan2(selectedPointLoad.fy, selectedPointLoad.fx) * 180 / Math.PI;
                            const selectedStage = getSelectedStage();
                            const isActiveInStage = selectedStage?.activePointLoads.includes(selectedPointLoadId) || false;
                            
                            return (
                                <div className="space-y-4">
                                    {/* Stage Activation Control */}
                                    {selectedStage && (
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                            <h4 className="font-medium text-blue-800 mb-2">Stage Control</h4>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-blue-700">Active in {selectedStage.name}:</span>
                                                    <button
                                                        onClick={() => togglePointLoadInStage(selectedStage.id, selectedPointLoadId)}
                                                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                                            isActiveInStage
                                                                ? 'bg-green-500 text-white hover:bg-green-600'
                                                                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                                                        }`}
                                                    >
                                                        {isActiveInStage ? 'Active' : 'Inactive'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Basic Info */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Basic Information</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">ID:</span>
                                                <span className="font-mono">{selectedPointLoadId}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Position:</span>
                                                <span className="font-mono">
                                                    ({selectedPointLoad.x.toFixed(2)}, {selectedPointLoad.y.toFixed(2)})
                                                </span>
                                            </div>
                                            {selectedPointLoad.node !== undefined && (
                                                <div className="flex justify-between">
                                                    <span className="text-gray-600">Assigned Node:</span>
                                                    <span>{selectedPointLoad.node}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Force Components */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Force Components</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Fx (Horizontal):</span>
                                                <span className="font-mono">{selectedPointLoad.fx.toFixed(2)} kN</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Fy (Vertical):</span>
                                                <span className="font-mono">{selectedPointLoad.fy.toFixed(2)} kN</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Magnitude:</span>
                                                <span className="font-mono">{magnitude.toFixed(2)} kN</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Angle:</span>
                                                <span className="font-mono">{angle.toFixed(1)}°</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* Water Level Information */}
                        {selectedWaterLevelId && (() => {
                            const selectedWaterLevel = waterLevelList.find(wl => wl.id === selectedWaterLevelId);
                            if (!selectedWaterLevel) return null;

                            const selectedStage = getSelectedStage();
                            const isActiveInStage = selectedStage?.activeWaterLevels.includes(selectedWaterLevelId) || false;
                            
                            return (
                                <div className="space-y-4">
                                    {/* Stage Activation Control */}
                                    {selectedStage && (
                                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
                                            <h4 className="font-medium text-blue-800 mb-2">Stage Control</h4>
                                            <div className="space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm text-blue-700">Active in {selectedStage.name}:</span>
                                                    <button
                                                        onClick={() => toggleWaterLevelInStage(selectedStage.id, selectedWaterLevelId)}
                                                        className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                                                            isActiveInStage
                                                                ? 'bg-green-500 text-white hover:bg-green-600'
                                                                : 'bg-gray-300 text-gray-700 hover:bg-gray-400'
                                                        }`}
                                                    >
                                                        {isActiveInStage ? 'Active' : 'Inactive'}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Basic Info */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Basic Information</h4>
                                        <div className="space-y-2 text-sm">
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">ID:</span>
                                                <span className="font-mono">{selectedWaterLevelId}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Points:</span>
                                                <span>{selectedWaterLevel.points.length}</span>
                                            </div>
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Status:</span>
                                                <span className={selectedWaterLevel.isActive ? 'text-green-600' : 'text-gray-600'}>
                                                    {selectedWaterLevel.isActive ? 'Active' : 'Inactive'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Point Coordinates */}
                                    <div className="bg-gray-50 p-3 rounded-lg">
                                        <h4 className="font-medium text-gray-800 mb-2">Point Coordinates</h4>
                                        <div className="max-h-32 overflow-y-auto">
                                            {selectedWaterLevel.points.map((point, index) => (
                                                <div key={index} className="flex justify-between text-sm mb-1">
                                                    <span className="text-gray-600">P{index}:</span>
                                                    <span className="font-mono">
                                                        ({point.x.toFixed(2)}, {point.y.toFixed(2)})
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
};

export default StagingWizard; 