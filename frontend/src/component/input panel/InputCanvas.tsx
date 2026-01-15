import React, { useState, useRef, useEffect } from 'react';
import { flushSync } from 'react-dom';
import { Stage, Layer, Line, Circle, Text, Group, Rect } from 'react-konva';
import { useAppContext } from '../../App';
import { ArrowDownToDotIcon, PaletteIcon } from 'lucide-react';
import Arrow from '../Arrow';
import './InputCanvas.css';

interface Node {
    id: number;
    x: number;
    y: number;
}

interface Element {
    id: number;
    node1: number;
    node2: number;
    node3: number;
}

interface ElementMaterial {
    element_id: number;
    material: {
        id?: string;
        name: string;
        color: string;
        youngsModulus: number;
        poissonsRatio: number;
        unitWeightSaturated: number;  // ✅ Gamma saturated
        unitWeightUnsaturated: number;  // ✅ Gamma unsaturated
        cohesion: number;
        frictionAngle: number;
        thickness: number;
        permeability: number;
        voidRatio: number;
        specificGravity: number;
    };
}

interface BoundaryConditionFullFixed {
    node: number;
}

interface BoundaryConditionNormalFixed {
    node: number;
}

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

interface PointLoad {
    id: string;
    x: number;
    y: number;
    fx: number;
    fy: number;
    node?: number; // Added node property
}

interface InputCanvasProps {
    externalPolygonMode?: boolean;
    externalRectangleMode?: boolean;
    externalSelectMode?: boolean;
    externalPointLoadMode?: boolean;
    externalWaterLevelMode?: boolean;
    showMaterialViz?: boolean;
}

const InputCanvas: React.FC<InputCanvasProps> = ({ 
    externalPolygonMode,
    externalRectangleMode,
    externalSelectMode,
    externalPointLoadMode,
    externalWaterLevelMode,
    showMaterialViz
}: InputCanvasProps = {}) => {
    const { 
        polygons, 
        setPolygons,
        selectedPolygonId,
        setSelectedPolygonId,
        materialList,
        assignMaterialToPolygon,
        // General settings
        showGrid,
        gridSize,
        showAxis,
        showAxisLabels,
        snapToGrid,
        // Mesh generation context
        nodeList, addNode, clearNodes,
        elementList, addElement, clearElements,
        boundaryConditionListFullFixed, addBoundaryConditionFullFixed, clearBoundaryConditions,
        boundaryConditionListNormalFixed, addBoundaryConditionNormalFixed,
        elementMaterials, setElementMaterials,
        // Point load context
        pointLoadList, addPointLoad, updatePointLoad, deletePointLoad, assignNodesToPointLoads,
        selectedPointLoadId, setSelectedPointLoadId,
        // Water level context
        waterLevelList, addWaterLevel, updateWaterLevel, deleteWaterLevel,
        selectedWaterLevelId, setSelectedWaterLevelId
    } = useAppContext();
    
    // Canvas state
    const [currentPolygon, setCurrentPolygon] = useState<Polygon>({
        vertices: [],
        meshSize: gridSize,
        boundaryRefinementFactor: 1 // Default to 1 for now, as it's not directly managed by context
    });
    const [isDrawingPolygon, setIsDrawingPolygon] = useState(false);
    const [isRectangleMode, setIsRectangleMode] = useState(false);
    const [isPolygonMode, setIsPolygonMode] = useState(true);
    const [isPointLoadMode, setIsPointLoadMode] = useState(false);
    const [isWaterLevelMode, setIsWaterLevelMode] = useState(false);
    const [mousePosition, setMousePosition] = useState<Point | null>(null);
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState<Point | null>(null);
    const [rectangleStart, setRectangleStart] = useState<Point | null>(null);
    const [rectangleEnd, setRectangleEnd] = useState<Point | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [currentWaterLevel, setCurrentWaterLevel] = useState<Point[]>([]);
    const [isDrawingWaterLevel, setIsDrawingWaterLevel] = useState(false);
    
    // Local state for element materials to debug the issue
    const [localElementMaterials, setLocalElementMaterials] = useState<Array<{element_id: number, material: any}>>([]);
    
    // Use external polygon mode if provided, otherwise use local state
    const effectivePolygonMode = externalPolygonMode !== undefined ? externalPolygonMode : isPolygonMode;
    // Use external rectangle mode if provided, otherwise use local state
    const effectiveRectangleMode = externalRectangleMode !== undefined ? externalRectangleMode : isRectangleMode;
    const isSelectMode = externalSelectMode !== undefined ? externalSelectMode : false;
    // Use external point load mode if provided, otherwise use local state
    const effectivePointLoadMode = externalPointLoadMode !== undefined ? externalPointLoadMode : isPointLoadMode;
    // Use external water level mode if provided, otherwise use local state
    const effectiveWaterLevelMode = externalWaterLevelMode !== undefined ? externalWaterLevelMode : isWaterLevelMode;
    


    // Konva stage ref
    const stageRef = useRef<any>(null);

    // Update currentPolygon when meshSize or boundaryRefinementFactor changes
    useEffect(() => {
        setCurrentPolygon(prev => ({
            ...prev,
            meshSize: gridSize,
            boundaryRefinementFactor: 0.5 // This is not directly managed by context, so keep default
        }));
        
        // Update all existing polygons with new mesh settings
        setPolygons(prevPolygons => 
            prevPolygons.map(polygon => ({
                ...polygon,
                meshSize: gridSize,
                boundaryRefinementFactor: 0.5 // This is not directly managed by context, so keep default
            }))
        );
        
        console.log('Updated all polygons with new mesh settings:', { meshSize: gridSize, boundaryRefinementFactor: 1 });
    }, [gridSize]);

    // Monitor elementMaterials changes
    useEffect(() => {
        console.log('🔄 elementMaterials changed in InputCanvas:', elementMaterials);
        console.log('🔄 elementMaterials length:', elementMaterials.length);
    }, [elementMaterials]);

    // Monitor localElementMaterials changes
    useEffect(() => {
        console.log('🔄 localElementMaterials changed in InputCanvas:', localElementMaterials);
        console.log('🔄 localElementMaterials length:', localElementMaterials.length);
        console.log('🔄 Context elementMaterials:', elementMaterials);
        console.log('🔄 Context elementMaterials length:', elementMaterials.length);
        console.log('🔄 Are they equal?', JSON.stringify(localElementMaterials) === JSON.stringify(elementMaterials));
    }, [localElementMaterials, elementMaterials]);

    // Global keyboard event handler
    useEffect(() => {
        const handleGlobalKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && isDrawingPolygon && currentPolygon.vertices.length >= 3 && effectivePolygonMode) {
                e.preventDefault();
                finishPolygon();
            }
            if (e.key === 'Enter' && isDrawingWaterLevel && currentWaterLevel.length >= 2 && effectiveWaterLevelMode) {
                e.preventDefault();
                console.log('Finishing water level with points:', currentWaterLevel);
                finishWaterLevel();
            }
            if (e.key === 'Escape' && effectiveRectangleMode) {
                e.preventDefault();
                cancelRectangle();
            }
            if (e.key === 'Escape' && effectiveWaterLevelMode) {
                e.preventDefault();
                cancelWaterLevel();
            }
            // Handle Delete key for deleting selected polygon, point load, or water level
            if (e.key === 'Delete') {
                e.preventDefault();
                if (selectedPolygonId) {
                deleteSelectedPolygon();
                } else if (selectedPointLoadId) {
                    deleteSelectedPointLoad();
                } else if (selectedWaterLevelId) {
                    deleteSelectedWaterLevel();
                }
            }
        };

        // Add global event listener
        document.addEventListener('keydown', handleGlobalKeyDown);

        // Cleanup
        return () => {
            document.removeEventListener('keydown', handleGlobalKeyDown);
        };
    }, [isDrawingPolygon, currentPolygon.vertices.length, effectivePolygonMode, effectiveRectangleMode, effectiveWaterLevelMode, isDrawingWaterLevel, currentWaterLevel.length, selectedPolygonId, selectedPointLoadId, selectedWaterLevelId]);

    // Canvas dimensions and viewport
    const containerRef = useRef<HTMLDivElement>(null);
    const [canvasWidth, setCanvasWidth] = useState(1000);
    const [canvasHeight, setCanvasHeight] = useState(800);
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

    // Calculate base scale
    const baseScaleX = (canvasWidth - 2 * padding) / (baseViewportMaxX - baseViewportMinX);
    const baseScaleY = (canvasHeight - 2 * padding) / (baseViewportMaxY - baseViewportMinY);
    const baseScale = Math.min(baseScaleX, baseScaleY);

    // Viewport state
    const [viewport, setViewport] = useState({
        scale: 1,
        x: 0,
        y: 0
    });

    // Convert world coordinates to stage coordinates
    const worldToStage = (worldX: number, worldY: number) => {
        const stageX = padding + (worldX - baseViewportMinX) * baseScale * viewport.scale + viewport.x;
        const stageY = canvasHeight - padding - (worldY - baseViewportMinY) * baseScale * viewport.scale + viewport.y;
        return { x: stageX, y: stageY };
    };

    // Convert stage coordinates to world coordinates
    const stageToWorld = (stageX: number, stageY: number) => {
        const worldX = baseViewportMinX + (stageX - padding - viewport.x) / (baseScale * viewport.scale);
        const worldY = baseViewportMinY + (canvasHeight - padding - stageY + viewport.y) / (baseScale * viewport.scale);
        return { x: worldX, y: worldY };
    };

    // Snap to grid function
    const snapPointToGrid = (point: Point): Point => {
        if (!snapToGrid) return point; // Don't snap if disabled
        const gridSpacing = gridSize; // Use gridSize from context
        return {
            x: Math.round(point.x / gridSpacing) * gridSpacing,
            y: Math.round(point.y / gridSpacing) * gridSpacing
        };
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

    // Get node positions for elements
    const getNodePosition = (nodeId: number) => {
        
        const node = nodeList.find((n: Node) => n.id === nodeId);
        if (!node) {
            return { x: NaN, y: NaN };
        }
        
        const pos = worldToStage(node.x, node.y);
        
        if (isNaN(pos.x) || isNaN(pos.y)) {
            return { x: NaN, y: NaN };
        }
        
        return pos;
    };

    // Check if node is fixed
    const isNodeFixed = (nodeId: number) => {
        return boundaryConditionListFullFixed.some((bc: BoundaryConditionFullFixed) => bc && bc.node === nodeId);
    };

    const isNodeNormalFixed = (nodeId: number) => {
        return boundaryConditionListNormalFixed.some((bc: BoundaryConditionNormalFixed) => bc && bc.node === nodeId);
    };

    // Mouse event handlers
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
        
        // Handle rectangle drawing with left click (without Ctrl) when rectangle mode is active
        if (e.evt.button === 0 && !e.evt.ctrlKey && effectiveRectangleMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
            
            if (!rectangleStart) {
                // First click - set start point
                setRectangleStart(snappedPoint);
            } else {
                // Second click - set end point and finish rectangle
                setRectangleEnd(snappedPoint);
                finishRectangle();
            }
            return;
        }
        
        // Handle point load placement
        if (e.evt.button === 0 && !e.evt.ctrlKey && effectivePointLoadMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
            
            // Create new point load with default values
            const newPointLoad: PointLoad = {
                id: `pointload_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                x: snappedPoint.x,
                y: snappedPoint.y,
                fx: 0, // Default fx = 0 kN
                fy: -10 // Default fy = -10 kN (downward)
            };
            
            addPointLoad(newPointLoad);
            console.log("Point load added:", newPointLoad);
            return;
        }

        // Handle water level drawing
        if (e.evt.button === 0 && !e.evt.ctrlKey && effectiveWaterLevelMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
            
            if (!isDrawingWaterLevel) {
                // Start drawing water level
                setCurrentWaterLevel([snappedPoint]);
                setIsDrawingWaterLevel(true);
            } else {
                // Add point to water level
                setCurrentWaterLevel(prev => [...prev, snappedPoint]);
            }
            return;
        }
        // Handle polygon drawing with left click (without Ctrl) only when polygon mode is active
        if (e.evt.button === 0 && !e.evt.ctrlKey && effectivePolygonMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
        
        // If not currently drawing and polygon is completed, start a new polygon
        if (!isDrawingPolygon && currentPolygon.vertices.length > 0) {
            // Check if the last vertex is the same as the first (polygon is closed)
            const lastVertex = currentPolygon.vertices[currentPolygon.vertices.length - 1];
            const firstVertex = currentPolygon.vertices[0];
            const isPolygonClosed = lastVertex.x === firstVertex.x && lastVertex.y === firstVertex.y;
            
            if (isPolygonClosed) {
                // Start a new polygon
                setCurrentPolygon({
                    vertices: [snappedPoint],
                    meshSize: currentPolygon.meshSize,
                    boundaryRefinementFactor: 1 // This is not directly managed by context, so keep default
                });
                setIsDrawingPolygon(true);
                return;
            }
        }
            
            // Check if clicking on first vertex to close polygon
            if (isDrawingPolygon && currentPolygon.vertices.length >= 3) {
                const firstVertex = currentPolygon.vertices[0];
                const distance = Math.sqrt(
                    Math.pow(snappedPoint.x - firstVertex.x, 2) + 
                    Math.pow(snappedPoint.y - firstVertex.y, 2)
                );
                
                // If clicking near first vertex (within 0.5 units), close the polygon
                if (distance < 0.5) {
                    finishPolygon();
                return;
            }
        }
        
        // Add vertex to current polygon
        setCurrentPolygon(prev => ({
            ...prev,
            vertices: [...prev.vertices, snappedPoint]
        }));
        
        // Set drawing mode to true when first vertex is added
        if (!isDrawingPolygon) {
            setIsDrawingPolygon(true);
        }
        }
        
        // Clear selection if clicking on empty area in select mode
        if (isSelectMode && !effectivePolygonMode && !effectiveRectangleMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const clickedPolygonId = findPolygonAtPoint(worldPoint);
            if (!clickedPolygonId) {
                setSelectedPolygonId(null);
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
        
        // Handle rectangle drawing preview
        if (effectiveRectangleMode && rectangleStart) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
            setRectangleEnd(snappedPoint);
            setMousePosition(snappedPoint);
        }
        // Handle polygon drawing preview only when polygon mode is active
        else if (isDrawingPolygon && effectivePolygonMode) {
            const worldPoint = stageToWorld(pointerPos.x, pointerPos.y);
            const snappedPoint = snapPointToGrid(worldPoint);
            setMousePosition(snappedPoint);
        } else {
            setMousePosition(null);
        }
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

    // Reset view function
    const resetView = () => {
        setViewport({
            scale: 1,
            x: 0,
            y: 0
        });
    };

    const finishPolygon = () => {
        if (isDrawingPolygon && currentPolygon.vertices.length >= 3) {
            // Close the polygon by adding first vertex again
            const completedPolygon = {
                ...currentPolygon,
                vertices: [...currentPolygon.vertices, currentPolygon.vertices[0]],
                id: `polygon_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` // Add unique ID
            };
            
            // Add to polygons array
            setPolygons((prev: Polygon[]) => [...prev, completedPolygon]);
            
            // Reset current polygon for next drawing
            setCurrentPolygon({
                vertices: [],
                meshSize: gridSize,
                boundaryRefinementFactor: 1 // This is not directly managed by context, so keep default
            });
            setIsDrawingPolygon(false);
            setMousePosition(null);
        }
    };


    const finishRectangle = () => {
        if (effectiveRectangleMode && rectangleStart && rectangleEnd) {
            // Create rectangle vertices (clockwise)
            const minX = Math.min(rectangleStart.x, rectangleEnd.x);
            const maxX = Math.max(rectangleStart.x, rectangleEnd.x);
            const minY = Math.min(rectangleStart.y, rectangleEnd.y);
            const maxY = Math.max(rectangleStart.y, rectangleEnd.y);

            const rectangleVertices = [
                { x: minX, y: minY }, // bottom-left
                { x: maxX, y: minY }, // bottom-right
                { x: maxX, y: maxY }, // top-right
                { x: minX, y: maxY }, // top-left
                { x: minX, y: minY }  // close rectangle
            ];
            
            const completedRectangle = {
                vertices: rectangleVertices,
                meshSize: gridSize,
                boundaryRefinementFactor: 1, // This is not directly managed by context, so keep default
                id: `rectangle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            };
            
            // Add to polygons array
            setPolygons((prev: Polygon[]) => [...prev, completedRectangle]);
            
            // Reset rectangle drawing
            setRectangleStart(null);
            setRectangleEnd(null);
            setMousePosition(null);
        }
    };

    const cancelRectangle = () => {
        setRectangleStart(null);
        setRectangleEnd(null);
        setMousePosition(null);
    };

    // Function to delete selected polygon
    const deleteSelectedPolygon = () => {
        if (selectedPolygonId) {
            setPolygons(prevPolygons => 
                prevPolygons.filter(polygon => 
                    (polygon.id || `polygon_${polygons.indexOf(polygon)}`) !== selectedPolygonId
                )
            );
            setSelectedPolygonId(null);
        }
    };

    const deleteSelectedPointLoad = () => {
        if (selectedPointLoadId) {
            deletePointLoad(selectedPointLoadId);
            setSelectedPointLoadId(null);
        }
    };

    // Water Level functions
    const finishWaterLevel = () => {
        console.log('finishWaterLevel called with points:', currentWaterLevel);
        if (currentWaterLevel.length >= 2) {
            const newWaterLevel = {
                id: `waterlevel_${Date.now()}`,
                points: [...currentWaterLevel],
                isActive: false
            };
            console.log('Creating new water level:', newWaterLevel);
            addWaterLevel(newWaterLevel);
            setCurrentWaterLevel([]);
            setIsDrawingWaterLevel(false);
            console.log('Water level finished successfully');
        } else {
            console.log('Not enough points to finish water level');
        }
    };

    const cancelWaterLevel = () => {
        setCurrentWaterLevel([]);
        setIsDrawingWaterLevel(false);
    };

    const deleteSelectedWaterLevel = () => {
        if (selectedWaterLevelId) {
            deleteWaterLevel(selectedWaterLevelId);
            setSelectedWaterLevelId(null);
        }
    };



    const getMaterialColor = (materialId: string | undefined) => {
        if (!materialId) return '#666'; // Default gray for unassigned materials
        const material = materialList.find(m => m.id === materialId);
        return material ? material.color : '#666';
    };

        


    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        console.log('Drop event triggered');
        
        try {
            const data = JSON.parse(e.dataTransfer.getData('application/json'));
            console.log('Drop data:', data);
            
            if (data.type === 'material') {
                let targetPolygonId = selectedPolygonId;
                console.log('Selected polygon ID:', targetPolygonId);
                
                // If no polygon is selected, try to find polygon at drop position
                if (!targetPolygonId) {
                    const stage = stageRef.current;
                    if (stage) {
                        const pointerPos = stage.getPointerPosition();
                        console.log('Pointer position:', pointerPos);
                        if (pointerPos) {
                            const worldPos = stageToWorld(pointerPos.x, pointerPos.y);
                            console.log('World position:', worldPos);
                            
                            // Try to find polygon using a simpler approach
                            for (let i = 0; i < polygons.length; i++) {
                                const polygon = polygons[i];
                                console.log(`Checking polygon ${i}:`, polygon);
                                if (isPointInPolygon(worldPos, polygon)) {
                                    targetPolygonId = polygon.id || `polygon_${i}`;
                                    console.log(`Found polygon ${i} at drop position:`, targetPolygonId);
                                    break;
                                }
                            }
                        }
                    }
                }
                
                if (targetPolygonId) {
                    console.log('Assigning material', data.materialId, 'to polygon', targetPolygonId);
                    assignMaterialToPolygon(targetPolygonId, data.materialId);
                    // Force re-render
                    setPolygons(prev => [...prev]);
        } else {
                    console.log('No polygon found or selected');
                    console.log('Available polygons:', polygons);
                    alert('Please follow these steps:\n1. Click "Select" button in toolbar\n2. Click on a polygon to select it (it will turn red)\n3. Then drag and drop material from Project Browser');
                }
            }
        } catch (error) {
            console.error('Error parsing drop data:', error);
            alert('Error assigning material. Please try again.');
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    // Sample polygons - Two rectangles (top and bottom)
    const loadSamplePolygons = () => {
        const topRectangle = {
            vertices: [
                { x: -10, y: 1 },
                { x: 10, y: 1 },
                { x: 10, y: 5 },
                { x: -10, y: 5 },
                { x: -10, y: 1 }
            ],
            meshSize: gridSize,
            boundaryRefinementFactor: 1, // This is not directly managed by context, so keep default
            id: `top_rectangle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        const bottomRectangle = {
            vertices: [
                { x: -10, y: -5 },
                { x: 10, y: -5 },
                { x: 10, y: 1 },
                { x: -10, y: 1 },
                { x: -10, y: -5 }
            ],
            meshSize: gridSize,
            boundaryRefinementFactor: 1, // This is not directly managed by context, so keep default
            id: `bottom_rectangle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        const topSlope = {
            vertices: [
                { x: -2, y: 5 },
                { x: 4, y: 8 },
                { x: 10, y: 8 },
                { x: 10, y: 5 },
                { x: -2, y: 5 }
            ],
            meshSize: gridSize,
            boundaryRefinementFactor: 1, // This is not directly managed by context, so keep default
            id: `bottom_rectangle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
        };

        setPolygons([topRectangle, bottomRectangle, topSlope]);
    };

    // Mesh generation
    const generateMesh = async () => {
        console.log('=== GENERATE MESH FUNCTION START ===');
        console.log('pointLoadList at start:', pointLoadList);
        console.log('pointLoadList length:', pointLoadList.length);
        console.log('pointLoadList type:', typeof pointLoadList);
        console.log('pointLoadList is array:', Array.isArray(pointLoadList));
        
        if (polygons.length === 0) {
            alert('Please draw at least one polygon before generating mesh.');
            return;
        }
        
        // Validate material assignments
        if (!materialList || materialList.length === 0) {
            alert('Error: No materials defined. Please create materials first.');
            return;
        }

        // Check if all polygons have materials assigned
        const polygonsWithoutMaterial = polygons.filter(polygon => !polygon.materialId);
        if (polygonsWithoutMaterial.length > 0) {
            alert(`Error: ${polygonsWithoutMaterial.length} polygon(s) have no material assigned. Please assign material to all polygons before generating mesh.`);
            return;
        }

        try {
            // Debug: Log the data being sent
            console.log('=== FRONTEND MESH GENERATION DEBUG ===');
            console.log('Current mesh settings:', { meshSize: gridSize, boundaryRefinementFactor: 1 });
            console.log('Polygons being sent:', polygons);
            console.log('Materials being sent:', materialList);
            console.log('Point loads being sent:', pointLoadList);
            console.log('Point loads count:', pointLoadList.length);
            console.log('Point loads type:', typeof pointLoadList);
            console.log('Point loads is array:', Array.isArray(pointLoadList));
            if (pointLoadList.length > 0) {
                console.log('First point load:', pointLoadList[0]);
                console.log('First point load keys:', Object.keys(pointLoadList[0]));
            }
            
            const meshData = {
                polygons: polygons,
                materials: materialList,
                pointLoads: pointLoadList  // Add point loads to mesh generation
            };
            console.log('Full request data:', JSON.stringify(meshData, null, 2));
            console.log('=== VERIFYING POINT LOADS IN REQUEST ===');
            console.log('meshData has pointLoads property:', 'pointLoads' in meshData);
            console.log('meshData.pointLoads:', meshData.pointLoads);
            console.log('meshData.pointLoads length:', meshData.pointLoads ? meshData.pointLoads.length : 'undefined');
            console.log('=== END VERIFICATION ===');
            
            const response = await fetch('http://localhost:8000/api/mesh/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(meshData),
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
                        }

            const data = await response.json();
            
            if (data.success) {
                // Clear existing data
                clearNodes();
                clearElements();
                clearBoundaryConditions();
                
                console.log('Mesh data received:', data);
                console.log('🔍 element_materials from backend:', data.element_materials);
                console.log('🔍 element_materials type:', typeof data.element_materials);
                console.log('🔍 element_materials is array:', Array.isArray(data.element_materials));
                console.log('🔍 element_materials length:', data.element_materials?.length);
                
                // Add new nodes
                if (data.nodes && Array.isArray(data.nodes)) {
                    console.log('Processing nodes data:', data.nodes);
                    data.nodes.forEach((node: any, index: number) => {
                    console.log(`Processing node ${index}:`, node);
                    
                        // Handle different data formats
                        let nodeData: Node;
                    if (Array.isArray(node)) {
                            // Format: [x, y] - backend sends [x, y] without id
                            // Backend uses 0-based indexing, but we need to convert to 1-based for frontend
                        nodeData = {
                                id: index + 1, // Use 1-based indexing for node ID
                                x: node[0] || 0,
                                y: node[1] || 0
                            };
                        } else if (typeof node === 'object' && node !== null) {
                            // Format: {id, x, y}
                            nodeData = {
                                id: node.id || index,
                                x: node.x || 0,
                                y: node.y || 0
                        };
                    } else {
                            console.error(`Invalid node format at index ${index}:`, node);
                            return;
                        }
                        
                        console.log(`Adding node:`, nodeData);
                        addNode(nodeData);
                    });
                    } else {
                    console.error('Invalid nodes data:', data.nodes);
                    }
                
                // Add new elements
                if (data.elements && Array.isArray(data.elements)) {
                    console.log('Processing elements data:', data.elements);
                    data.elements.forEach((element: any, index: number) => {
                    console.log(`Processing element ${index}:`, element);
                    
                        // Handle different data formats
                        let elementData: Element;
                    if (Array.isArray(element)) {
                            // Format: [node1, node2, node3] - backend sends node indices
                            // Backend uses 0-based indexing, but we need to convert to 1-based for frontend
                        elementData = {
                                id: index + 1, // Use 1-based indexing for element ID
                                node1: (element[0] || 0) + 1, // Convert to 1-based node indexing
                                node2: (element[1] || 0) + 1, // Convert to 1-based node indexing
                                node3: (element[2] || 0) + 1  // Convert to 1-based node indexing
                            };
                        } else if (typeof element === 'object' && element !== null) {
                            // Format: {node1, node2, node3}
                            elementData = {
                                id: element.id || index,
                                node1: element.node1 || 0,
                                node2: element.node2 || 0,
                                node3: element.node3 || 0
                        };
                    } else {
                            console.error(`Invalid element format at index ${index}:`, element);
                            return;
                        }
                        
                                        console.log(`Adding element:`, elementData);
                addElement(elementData);
                

                    });
                    } else {
                    console.error('Invalid elements data:', data.elements);
                    }
                
                // Add boundary conditions
                console.log('Processing boundary conditions:', data.boundary_conditions);
                if (data.boundary_conditions && data.boundary_conditions.full_fixed) {
                    if (Array.isArray(data.boundary_conditions.full_fixed)) {
                        console.log('Processing full_fixed boundary conditions:', data.boundary_conditions.full_fixed);
                        data.boundary_conditions.full_fixed.forEach((item: any, index: number) => {
                            // Handle different possible formats
                            let nodeId: number;
                            if (typeof item === 'number') {
                                nodeId = item + 1; // Convert to 1-based indexing
                            } else if (item && typeof item === 'object' && typeof item.node === 'number') {
                                nodeId = item.node + 1; // Convert to 1-based indexing
                            } else if (item && typeof item === 'object' && typeof item.id === 'number') {
                                nodeId = item.id + 1; // Convert to 1-based indexing
                            } else {
                                console.error(`Invalid full fixed BC item ${index}:`, item);
                                return;
                            }
                            
                            console.log(`Adding full fixed BC for node ${nodeId}`);
                            addBoundaryConditionFullFixed({ node: nodeId });
                        });
                    } else {
                        console.error('full_fixed is not an array:', data.boundary_conditions.full_fixed);
                    }
                } else {
                    console.log('No full_fixed boundary conditions found');
                }
                
                                if (data.boundary_conditions && data.boundary_conditions.normal_fixed) {
                    if (Array.isArray(data.boundary_conditions.normal_fixed)) {
                        console.log('Processing normal_fixed boundary conditions:', data.boundary_conditions.normal_fixed);
                        data.boundary_conditions.normal_fixed.forEach((item: any, index: number) => {
                            // Handle different possible formats
                            let nodeId: number;
                            if (typeof item === 'number') {
                                nodeId = item + 1; // Convert to 1-based indexing
                            } else if (item && typeof item === 'object' && typeof item.node === 'number') {
                                nodeId = item.node + 1; // Convert to 1-based indexing
                            } else if (item && typeof item === 'object' && typeof item.id === 'number') {
                                nodeId = item.id + 1; // Convert to 1-based indexing
                            } else {
                                console.error(`Invalid normal fixed BC item ${index}:`, item);
                                return;
                            }
                            
                            console.log(`Adding normal fixed BC for node ${nodeId}`);
                            addBoundaryConditionNormalFixed({ node: nodeId });
                    });
                    } else {
                        console.error('normal_fixed is not an array:', data.boundary_conditions.normal_fixed);
                    }
                } else {
                    console.log('No normal_fixed boundary conditions found');
                }
                
                // Store element materials from mesh generation response
                if (data.element_materials && Array.isArray(data.element_materials)) {
                    console.log('Processing element materials:', data.element_materials);
                    console.log('Element materials length:', data.element_materials.length);
                    console.log('First element material:', data.element_materials[0]);
                    console.log('Element materials structure check:', {
                        hasElementId: data.element_materials[0]?.hasOwnProperty('element_id'),
                        hasMaterial: data.element_materials[0]?.hasOwnProperty('material'),
                        materialHasUnitWeightSaturated: data.element_materials[0]?.material?.hasOwnProperty('unitWeightSaturated'),
                        materialHasUnitWeightUnsaturated: data.element_materials[0]?.material?.hasOwnProperty('unitWeightUnsaturated')
                    });
                    console.log('🔧 About to set element materials...');
                    console.log('🔧 Data to set:', data.element_materials);
                    console.log('🔧 Data length:', data.element_materials.length);
                    
                    // Set local state first to debug
                    setLocalElementMaterials(data.element_materials);
                    console.log('✅ Local element materials set successfully');
                    
                    // Then set context state
                    setElementMaterials((prevMaterials) => {
                        console.log('🔧 Previous materials:', prevMaterials);
                        console.log('🔧 New materials to set:', data.element_materials);
                        console.log('✅ Context element materials set successfully');
                        return data.element_materials;
                    });
                } else {
                    console.log('No element materials found in response');
                    console.log('data.element_materials:', data.element_materials);
                    console.log('data.element_materials type:', typeof data.element_materials);
                    console.log('data.element_materials is array:', Array.isArray(data.element_materials));
                    // Clear element materials if not provided
                    setElementMaterials([]);
                }
                
                // Assign nodes to point loads after mesh generation
                assignNodesToPointLoads();
                
                alert('Mesh generated successfully!');
            } else {
                alert('Failed to generate mesh: ' + data.error);
            }
        } catch (error) {
            console.error('Error generating mesh:', error);
            alert('Error generating mesh. Please check the console for details.');
        }
    };

    // Use assignNodesToPointLoads from context instead of local implementation


    // Generate grid lines based on current viewport
    const generateGridLines = () => {
        const lines = [];
        
        // Calculate current viewport bounds in world coordinates
        const currentViewportMinX = stageToWorld(0, 0).x;
        const currentViewportMaxX = stageToWorld(canvasWidth, 0).x;
        const currentViewportMinY = stageToWorld(0, canvasHeight).y;
        const currentViewportMaxY = stageToWorld(0, 0).y;
        
        // Adaptive grid spacing based on zoom level
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

    // Generate axis lines based on current viewport
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

    // Generate axis ticks based on current viewport
    const generateAxisTicks = () => {
        const ticks = [];
        
        // Calculate current viewport bounds in world coordinates
        const currentViewportMinX = stageToWorld(0, 0).x;
        const currentViewportMaxX = stageToWorld(canvasWidth, 0).x;
        const currentViewportMinY = stageToWorld(0, canvasHeight).y;
        const currentViewportMaxY = stageToWorld(0, 0).y;
        
        // Adaptive tick spacing based on zoom level
        let tickSpacing = 1;
        if (viewport.scale < 0.5) tickSpacing = 5;
        else if (viewport.scale < 1) tickSpacing = 2;
        else if (viewport.scale < 2) tickSpacing = 1;
        else if (viewport.scale < 5) tickSpacing = 0.5;
        else tickSpacing = 0.2;
        
        // Helper function to format tick labels
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
                x:5,
                y: tickPos.y,
                text: formatTickLabel(y),
                anchor: 'center'
            });
        }
        
        return ticks;
    };

    const renderPointLoads = () => {
        return pointLoadList.map((pointLoad) => {
            const pos = worldToStage(pointLoad.x, pointLoad.y);
            const isSelected = selectedPointLoadId === pointLoad.id;
            
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

    return (
                <Group key={`pointload-${pointLoad.id}`}>
                    {/* Point load circle */}
                    <Circle
                        x={pos.x}
                        y={pos.y}
                        radius={isSelected ? 3 : 1}
                        fill={isSelected ? "#ff0000" : "#ff6b6b"}
                        stroke={isSelected ? "#ff0000" : "#d63031"}
                        strokeWidth={isSelected ? 3 : 2}
                    />
                    
                    {/* Force vector arrow */}
                    <Arrow
                        x1={pos.x}
                        y1={pos.y}
                        x2={endX}
                        y2={endY}
                        stroke={isSelected ? "#ff0000" : "#d63031"}
                        strokeWidth={isSelected ? 3 : 2}
                        headLength={isSelected ? 10 : 8}
                        headAngle={Math.PI / 6}
                    />

                </Group>
            );
        });
    };

    const renderWaterLevels = () => {
        return waterLevelList.map((waterLevel) => {
            const isSelected = selectedWaterLevelId === waterLevel.id;
            
            // Convert points to stage coordinates
            const stagePoints = waterLevel.points.map(point => {
                const pos = worldToStage(point.x, point.y);
                return [pos.x, pos.y];
            }).flat();

            return (
                <Group key={`waterlevel-${waterLevel.id}`}>
                    {/* Water level line */}
                    <Line
                        points={stagePoints}
                        stroke={isSelected ? "#ff0000" : "#0066cc"}
                        strokeWidth={isSelected ? 4 : 2}
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
                                radius={isSelected ? 4 : 2}
                                fill={isSelected ? "#ff0000" : "#0066cc"}
                                stroke={isSelected ? "#ff0000" : "#004499"}
                                strokeWidth={isSelected ? 2 : 1}
                            />
                        );
                    })}
                </Group>
            );
        });
    };

    const renderCurrentWaterLevel = () => {
        if (!isDrawingWaterLevel || currentWaterLevel.length === 0) return null;

        // Convert points to stage coordinates
        const stagePoints = currentWaterLevel.map(point => {
            const pos = worldToStage(point.x, point.y);
            return [pos.x, pos.y];
        }).flat();

        return (
            <Group>
                {/* Current water level line */}
                <Line
                    points={stagePoints}
                    stroke="#0066cc"
                    strokeWidth={2}
                    lineCap="round"
                    lineJoin="round"
                    dash={[5, 5]}
                />
                
                {/* Current water level points */}
                {currentWaterLevel.map((point, index) => {
                    const pos = worldToStage(point.x, point.y);
                    return (
                        <Circle
                            key={`current-waterlevel-point-${index}`}
                            x={pos.x}
                            y={pos.y}
                            radius={2}
                            fill="#0066cc"
                            stroke="#004499"
                            strokeWidth={1}
                        />
                    );
                })}
            </Group>
        );
    };

    return (
        <div 
            ref={containerRef}
            className={`input-canvas-container w-full h-full ${isDragOver ? 'drag-over' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
        >
            {/* Controls */}
            <div 
                className="flex flex-row text-[10px] items-center gap-2 p-2">
                <button
                    onClick={resetView} 
                    className="bg-gray-500 text-white border-none px-2 py-1 rounded-md mr-2">
                    Reset View
                </button>
                <button
                    onClick={loadSamplePolygons} 
                    className="bg-blue-500 text-white border-none px-2 py-1 rounded-md mr-2">
                    Load Multi Polygon
                </button>
                        
                {/* Delete Selected Object Button */}
                {(selectedPolygonId || selectedPointLoadId || selectedWaterLevelId) && (
                    <button
                        onClick={() => {
                            if (selectedPolygonId) {
                                deleteSelectedPolygon();
                            } else if (selectedPointLoadId) {
                                deleteSelectedPointLoad();
                            } else if (selectedWaterLevelId) {
                                deleteSelectedWaterLevel();
                            }
                        }}
                        className="bg-red-500 text-white border-none px-2 py-1 rounded-md mr-2 hover:bg-red-600 transition-colors"
                        title="Delete Selected Object"
                    >
                        Delete
                    </button>
                )}
                        

                <span className="text-xs text-gray-500">Zoom: {(viewport.scale * 100).toFixed(0)}%</span>
                {/* Mouse Coordinates */}
                {mousePosition && (
                    <div className="p-3 bg-gray-100 rounded">
                        <p className="text-xs text-gray-600">
                            Mouse: ({mousePosition.x.toFixed(2)}, {mousePosition.y.toFixed(2)})
                        </p>
                    </div>
                )}
                {effectivePolygonMode && (
                    <div className="text-xs text-gray-500">
                        Polygon Mode: {isDrawingPolygon ? 'Drawing' : 'Ready'}
                        {isDrawingPolygon && (
                            <span> - Vertices: {currentPolygon.vertices.length}</span>
                        )}
                    </div>
                )}
                {effectiveRectangleMode && (
                    <div className="text-xs text-gray-500">
                        Rectangle Mode: {rectangleStart ? 'Click to finish' : 'Click to start'}
                    </div>
                )}
                {effectivePointLoadMode && (
                    <div className="text-xs text-gray-500">
                        Point Load Mode: Click to place load (Fx=0, Fy=-10 kN)
                    </div>
                )}

                {effectiveWaterLevelMode && (
                    <div className="text-xs text-gray-500">
                        Water Level Mode: {isDrawingWaterLevel ? 'Drawing' : 'Ready'}
                        {isDrawingWaterLevel && (
                            <span> - Points: {currentWaterLevel.length} (Press Enter to finish)</span>
                        )}
                    </div>
                )}

                {isSelectMode && (
                    <div className="text-xs text-gray-500">
                        Select Mode: Click on geometry to select
                        {selectedPolygonId && (
                            <span className="ml-2 text-red-500">| Selected: Polygon</span>
                        )}
                        {selectedPointLoadId && (
                            <span className="ml-2 text-red-500">| Selected: Point Load</span>
                        )}
                        {selectedWaterLevelId && (
                            <span className="ml-2 text-red-500">| Selected: Water Level</span>
                        )}
                    </div>
                )}
                
            </div>
            
            {/* Konva Stage */}
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
                    {/* Grid Lines */}
                    {showGrid && generateGridLines().map((line, index) => (
                        <Line
                            key={`grid-${index}`}
                            points={line}
                            stroke="#e0e0e0"
                            strokeWidth={0.5}
                        />
                    ))}

                    {/* Axis Lines */}
                    {showAxis && generateAxisLines().map((line, index) => (
                        <Line
                            key={`axis-${index}`}
                            points={line}
                            stroke="#000"
                            strokeWidth={1}
                        />
                    ))}

                    {/* Axis Ticks */}
                    {showAxisLabels && generateAxisTicks().map((tick, index) => (
                        <Text
                            key={`tick-${index}`}
                            x={tick.x}
                            y={tick.y}
                            text={tick.text}
                            fontSize={10}
                            fill="#000"
                            align="center"
                            verticalAlign="middle"
                                        />
                    ))}

                    {/* Non-selected Polygons (rendered first - lower z-index) */}
                    {polygons.map((polygon: Polygon, polygonIndex: number) => {
                        const isSelected = selectedPolygonId === (polygon.id || `polygon_${polygonIndex}`);
                        if (!isSelected) {
                            return (
                                <Group key={`polygon-${polygonIndex}`}>
                                    {/* Polygon Fill */}
                                    <Line
                                        points={polygon.vertices.flatMap(vertex => {
                                            const pos = worldToStage(vertex.x, vertex.y);
                                            return [pos.x, pos.y];
                                        })}
                                        fill={getMaterialColor(polygon.materialId)}
                                        stroke={getMaterialColor(polygon.materialId)}
                                        strokeWidth={2}
                                        closed={true}
                                        opacity={0.3}
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
                                                    stroke={getMaterialColor(polygon.materialId)}
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
                                                fill={getMaterialColor(polygon.materialId)}
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

                    {/* Current Polygon */}
                    {currentPolygon.vertices.length > 0 && (
                        <Group>
                            {/* Current Polygon Lines */}
                            {currentPolygon.vertices.map((vertex, vertexIndex) => {
                                if (vertexIndex < currentPolygon.vertices.length - 1) {
                                    const currentPos = worldToStage(vertex.x, vertex.y);
                                    const nextPos = worldToStage(currentPolygon.vertices[vertexIndex + 1].x, currentPolygon.vertices[vertexIndex + 1].y);
                                    return (
                                        <Line
                                            key={`current-line-${vertexIndex}`}
                                            points={[currentPos.x, currentPos.y, nextPos.x, nextPos.y]}
                                            stroke="#007bff"
                                            strokeWidth={2}
                                        />
                                    );
                                }
                                return null;
                            })}
                        
                            {/* Current Polygon Vertices */}
                            {currentPolygon.vertices.map((vertex, vertexIndex) => {
                                const pos = worldToStage(vertex.x, vertex.y);
                                return (
                                    <Circle
                                        key={`current-vertex-${vertexIndex}`}
                                        x={pos.x}
                                        y={pos.y}
                                        radius={4}
                                        fill="#007bff"
                                    />
                                );
                            })}
                        </Group>
                    )}

                    {/* Mouse Position Preview */}
                    {mousePosition && (
                        <Group>
                            {/* Preview Line */}
                            {currentPolygon.vertices.length > 0 && (
                                (() => {
                                    const lastVertex = currentPolygon.vertices[currentPolygon.vertices.length - 1];
                                    const lastPos = worldToStage(lastVertex.x, lastVertex.y);
                                    const mousePos = worldToStage(mousePosition.x, mousePosition.y);
                                    return (
                                        <Line
                                            points={[lastPos.x, lastPos.y, mousePos.x, mousePos.y]}
                                            stroke="#007bff"
                                            strokeWidth={1}
                                            dash={[5, 5]}
                                />
                                    );
                                })()
                            )}
                            
                            {/* Preview Point */}
                            {(() => {
                                const mousePos = worldToStage(mousePosition.x, mousePosition.y);
                                return (
                                    <Circle
                                        x={mousePos.x}
                                        y={mousePos.y}
                                        radius={3}
                                        fill="#007bff"
                                        opacity={0.7}
                                    />
                                    );
                            })()}
                        </Group>
                    )}
                        
                    {/* Rectangle Preview */}
                    {effectiveRectangleMode && rectangleStart && rectangleEnd && (
                        <Group>
                            {/* Rectangle Lines */}
                            {(() => {
                                const startPos = worldToStage(rectangleStart.x, rectangleStart.y);
                                const endPos = worldToStage(rectangleEnd.x, rectangleEnd.y);
                                
                                // Calculate rectangle corners
                                const minX = Math.min(rectangleStart.x, rectangleEnd.x);
                                const maxX = Math.max(rectangleStart.x, rectangleEnd.x);
                                const minY = Math.min(rectangleStart.y, rectangleEnd.y);
                                const maxY = Math.max(rectangleStart.y, rectangleEnd.y);
                                
                                const bottomLeft = worldToStage(minX, minY);
                                const bottomRight = worldToStage(maxX, minY);
                                const topRight = worldToStage(maxX, maxY);
                                const topLeft = worldToStage(minX, maxY);
                                
                                return [
                                    <Line
                                        key="rect-bottom"
                                        points={[bottomLeft.x, bottomLeft.y, bottomRight.x, bottomRight.y]}
                                        stroke="#ff6600"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                    />,
                                    <Line
                                        key="rect-right"
                                        points={[bottomRight.x, bottomRight.y, topRight.x, topRight.y]}
                                        stroke="#ff6600"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                    />,
                                    <Line
                                        key="rect-top"
                                        points={[topRight.x, topRight.y, topLeft.x, topLeft.y]}
                                        stroke="#ff6600"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                    />,
                                    <Line
                                        key="rect-left"
                                        points={[topLeft.x, topLeft.y, bottomLeft.x, bottomLeft.y]}
                                        stroke="#ff6600"
                                        strokeWidth={2}
                                        dash={[5, 5]}
                                    />
                                ];
                            })()}

                            {/* Rectangle Corner Points */}
                            {(() => {
                                const minX = Math.min(rectangleStart.x, rectangleEnd.x);
                                const maxX = Math.max(rectangleStart.x, rectangleEnd.x);
                                const minY = Math.min(rectangleStart.y, rectangleEnd.y);
                                const maxY = Math.max(rectangleStart.y, rectangleEnd.y);
                                
                                const corners = [
                                    worldToStage(minX, minY), // bottom-left
                                    worldToStage(maxX, minY), // bottom-right
                                    worldToStage(maxX, maxY), // top-right
                                    worldToStage(minX, maxY)  // top-left
                                ];
                                
                                return corners.map((corner, index) => (
                                    <Circle
                                        key={`rect-corner-${index}`}
                                        x={corner.x}
                                        y={corner.y}
                                        radius={3}
                                        fill="#ff6600"
                                        opacity={0.8}
                                    />
                                ));
                            })()}
                        </Group>
                    )}

                    {/* Mesh Elements */}
                    {elementList.map((element: Element, index: number) => {
                        const node1Pos = getNodePosition(element.node1);
                        const node2Pos = getNodePosition(element.node2);
                        const node3Pos = getNodePosition(element.node3);
                        
                        // Check for valid coordinates
                        if (isNaN(node1Pos.x) || isNaN(node1Pos.y) || 
                            isNaN(node2Pos.x) || isNaN(node2Pos.y) || 
                            isNaN(node3Pos.x) || isNaN(node3Pos.y)) {
                            console.warn(`Invalid coordinates for element ${element.id}:`, {
                                node1: element.node1, pos1: node1Pos,
                                node2: element.node2, pos2: node2Pos,
                                node3: element.node3, pos3: node3Pos
                            });
                        return null;
                        }
                        
                        // Get material color for element (simplified - just use gray for now)
                        const elementColor = "#666";
                        
                        return (
                            <Group key={`element-${index}`}>
                                {/* Element Fill (only when material visualization is enabled) */}
                                {showMaterialViz && (
                                    <Line
                                        points={[node1Pos.x, node1Pos.y, node2Pos.x, node2Pos.y, node3Pos.x, node3Pos.y, node1Pos.x, node1Pos.y]}
                                        fill={elementColor}
                                        stroke={elementColor}
                                        strokeWidth={1}
                                        opacity={0.6}
                                        closed={true}
                                    />
                                )}
                                
                                {/* Element Lines */}
                                <Line
                                    points={[node1Pos.x, node1Pos.y, node2Pos.x, node2Pos.y]}
                                    stroke={showMaterialViz ? elementColor : "#666"}
                                    strokeWidth={showMaterialViz ? 2 : 1}
                                />
                                <Line
                                    points={[node2Pos.x, node2Pos.y, node3Pos.x, node3Pos.y]}
                                    stroke={showMaterialViz ? elementColor : "#666"}
                                    strokeWidth={showMaterialViz ? 2 : 1}
                                />
                                <Line
                                    points={[node3Pos.x, node3Pos.y, node1Pos.x, node1Pos.y]}
                                    stroke={showMaterialViz ? elementColor : "#666"}
                                    strokeWidth={showMaterialViz ? 2 : 1}
                                />
                                
                                {/* Element Centroid with Material Info (only when material visualization is enabled) */}
                                {showMaterialViz && (
                                    (() => {
                                        const centroidX = (node1Pos.x + node2Pos.x + node3Pos.x) / 3;
                                        const centroidY = (node1Pos.y + node2Pos.y + node3Pos.y) / 3;

                                         return (
                                            <Group>
                                                <Circle
                                                    x={centroidX}
                                                    y={centroidY}
                                                    radius={3}
                                                    fill={elementColor}
                                                    stroke="black"
                                                    strokeWidth={1}
                                                />
                                                <Text
                                                    x={centroidX + 5}
                                                    y={centroidY - 10}
                                                    text={`E${element.id}`}
                                                    fontSize={10}
                                                    fill="black"
                                                    fontStyle="bold"
                                                />
                                            </Group>
                                        );
                                    })()
                                )}
                            </Group>
                        );
                    })}

                    {/* Mesh Nodes */}
                    {nodeList.map((node: Node, index: number) => {
                        const pos = worldToStage(node.x, node.y);
                        const isFixed = isNodeFixed(node.id);
                        const isNormalFixed = isNodeNormalFixed(node.id);

                        // Check for valid coordinates
                        if (isNaN(pos.x) || isNaN(pos.y)) {
                            console.warn(`Invalid coordinates for node ${node.id}:`, { x: node.x, y: node.y, pos });
                            return null;
                        }
                        
                        let fill = "#666";
                        if (isFixed) fill = "#ff0000";
                        else if (isNormalFixed) fill = "#00ff00";

                        return (
                            <Circle
                                key={`node-${index}`}
                                x={pos.x}
                                y={pos.y}
                                radius={2}
                                fill={fill}
                            />
                        );
                    })}

                    {/* Water Levels */}
                    {renderWaterLevels()}
                    
                    {/* Current Water Level (being drawn) */}
                    {renderCurrentWaterLevel()}

                    {/* Point Loads */}
                    {renderPointLoads()}
                </Layer>
            </Stage>
        </div>
    );
};

export default InputCanvas;