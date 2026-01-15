import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useAppContext } from '../App';
import { Stage, Layer, Line, Circle, Text, Group } from 'react-konva';
import './MeshWizard.css';

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

interface PointLoad {
    id: string;
    x: number;
    y: number;
    fx: number;
    fy: number;
    node?: number;
}

const MeshWizard: React.FC = () => {
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
        nodeList, 
        elementList,
        meshSize,
        boundaryRefinementFactor,
        setMeshSize,
        setBoundaryRefinementFactor,
        clearNodes,
        clearElements,
        addNode,
        addElement,
        materialList,
        showMesh,
        setShowMesh,
        clearMesh,
        addBoundaryConditionFullFixed,
        addBoundaryConditionNormalFixed,
        clearBoundaryConditions,
        boundaryConditionListFullFixed,
        boundaryConditionListNormalFixed,
        // General settings
        showGrid,
        gridSize,
        showAxis,
        showAxisLabels,
        pointLoadList,
        assignNodesToPointLoads,
        setPointLoadList, // Added setPointLoadList to context
        elementMaterials,
        setElementMaterials
    } = context;

    // Local state for element materials to debug the issue
    const [localElementMaterials, setLocalElementMaterials] = useState<Array<{element_id: number, material: any}>>([]);

    // Auto-assign nodes to point loads whenever nodeList changes
    useEffect(() => {
        if (nodeList.length > 0 && pointLoadList.length > 0) {
            console.log('🔄 Auto-assigning nodes to point loads due to nodeList change...');
            console.log('📊 nodeList length:', nodeList.length);
            console.log('📊 pointLoadList length:', pointLoadList.length);
            
            // Only assign if there are point loads without nodes or if nodes have changed significantly
            const needsAssignment = pointLoadList.some(pl => !pl.node);
            if (needsAssignment) {
                assignNodesToPointLoads();
            }
        }
    }, [nodeList.length, pointLoadList.length]); // Only depend on lengths to avoid infinite loops

    // Monitor elementMaterials changes in MeshWizard
    useEffect(() => {
        console.log('🔄 elementMaterials changed in MeshWizard:', elementMaterials);
        console.log('🔄 elementMaterials length:', elementMaterials?.length);
        
        // Sync local state with context state
        if (elementMaterials && elementMaterials.length > 0) {
            setLocalElementMaterials(elementMaterials);
            console.log('✅ Synced localElementMaterials with context elementMaterials');
        }
    }, [elementMaterials]);

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
    const [isGeneratingMesh, setIsGeneratingMesh] = useState(false);
    const [meshGenerationStatus, setMeshGenerationStatus] = useState('');
    const [showMaterialPoints, setShowMaterialPoints] = useState(false); // Default: hidden

    const stageRef = useRef<any>(null);

    // Mesh settings
    const [localMeshSize, setLocalMeshSize] = useState(meshSize);
    const [localBoundaryRefinementFactor, setLocalBoundaryRefinementFactor] = useState(boundaryRefinementFactor);

    // Update local settings when global settings change
    useEffect(() => {
        setLocalMeshSize(meshSize);
        setLocalBoundaryRefinementFactor(boundaryRefinementFactor);
    }, [meshSize, boundaryRefinementFactor]);

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

    const fitToView = () => {
        if (polygons.length === 0) return;

        // Calculate bounding box of all polygons
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        
        polygons.forEach(polygon => {
            polygon.vertices.forEach(vertex => {
                minX = Math.min(minX, vertex.x);
                minY = Math.min(minY, vertex.y);
                maxX = Math.max(maxX, vertex.x);
                maxY = Math.max(maxY, vertex.y);
            });
        });

        const contentWidth = maxX - minX;
        const contentHeight = maxY - minY;
        
        const scaleX = (canvasWidth - 2 * padding) / contentWidth * 0.8;
        const scaleY = (canvasHeight - 2 * padding) / contentHeight * 0.8;
        const newScale = Math.min(scaleX, scaleY);
        
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        
        const newX = canvasWidth / 2 - centerX * baseScale * newScale;
        const newY = canvasHeight / 2 + centerY * baseScale * newScale;
        
        setViewport({
            scale: newScale,
            x: newX,
            y: newY
        });
    };

    // Check if node is fixed
    const isNodeFixed = (nodeId: number) => {
        return boundaryConditionListFullFixed.some((bc: any) => bc && bc.node === nodeId);
    };

    const isNodeNormalFixed = (nodeId: number) => {
        return boundaryConditionListNormalFixed.some((bc: any) => bc && bc.node === nodeId);
    };

    // Material verification function
    const verifyMaterials = () => {
        console.log('🔍 Material verification debug:');
        console.log('- showMesh:', showMesh);
        console.log('- elementList.length:', elementList.length);
        console.log('- elementMaterials (context):', elementMaterials);
        console.log('- elementMaterials (context) length:', elementMaterials?.length);
        console.log('- localElementMaterials:', localElementMaterials);
        console.log('- localElementMaterials length:', localElementMaterials?.length);
        
        if (!showMesh || elementList.length === 0) {
            alert('❌ No mesh generated yet. Please generate mesh first to verify materials.');
            return;
        }

        if (!elementMaterials || elementMaterials.length === 0) {
            alert('❌ No materials assigned to elements. Please assign materials first.');
            return;
        }

        // Check if all elements have materials
        const elementsWithoutMaterials = elementList.filter(element => 
            !elementMaterials.some(em => em.element_id === element.id)
        );

        if (elementsWithoutMaterials.length > 0) {
            alert(`❌ Found ${elementsWithoutMaterials.length} elements without material assignments. Please assign materials to all elements.`);
            return;
        }

        // Check gamma values for all materials
        const invalidMaterials: string[] = [];
        const validMaterials = new Set<string>();

        elementMaterials.forEach((elementMaterial) => {
            const material = elementMaterial.material;
            if (material) {
                if (material.unitWeightSaturated === undefined || material.unitWeightSaturated === null ||
                    material.unitWeightUnsaturated === undefined || material.unitWeightUnsaturated === null) {
                    invalidMaterials.push(`Material ${material.name || material.id} (Element ${elementMaterial.element_id})`);
                } else if (material.unitWeightUnsaturated >= material.unitWeightSaturated) {
                    invalidMaterials.push(`Material ${material.name || material.id} (Element ${elementMaterial.element_id}): γ_unsat (${material.unitWeightUnsaturated}) must be < γ_sat (${material.unitWeightSaturated})`);
                } else {
                    validMaterials.add(material.name || material.id || '');
                }
            }
        });

        if (invalidMaterials.length > 0) {
            alert(`❌ Invalid gamma values found:\n\n${invalidMaterials.join('\n')}`);
            return;
        }

        // Success message
        const validMaterialsList = Array.from(validMaterials).join(', ');
        alert(`✅ Material verification successful!\n\nValid materials: ${validMaterialsList}\nTotal elements: ${elementList.length}\nAll elements have proper gamma values (γ_unsat < γ_sat)`);
    };

    const generateMesh = async () => {
        if (polygons.length === 0) {
            alert('No polygons available for mesh generation. Please create polygons in the Input Wizard first.');
            return;
        }

        // Check if all polygons have materials assigned
        const polygonsWithoutMaterial = polygons.filter(polygon => !polygon.materialId);
        if (polygonsWithoutMaterial.length > 0) {
            alert('Some polygons do not have materials assigned. Please assign materials to all polygons in the Input Wizard first.');
            return;
        }

        // Check if all assigned materials exist in materialList
        const assignedMaterialIds = polygons.map(polygon => polygon.materialId).filter(id => id);
        const availableMaterialIds = materialList.map(material => material.id).filter(id => id);
        const missingMaterials = assignedMaterialIds.filter(id => !availableMaterialIds.includes(id));
        
        if (missingMaterials.length > 0) {
            alert(`Some assigned materials are not available: ${missingMaterials.join(', ')}. Please check material assignments in the Input Wizard.`);
            return;
        }

        setIsGeneratingMesh(true);
        setMeshGenerationStatus('Generating mesh...');

        try {
            // Update global settings
            setMeshSize(localMeshSize);
            setBoundaryRefinementFactor(localBoundaryRefinementFactor);

            // Prepare mesh generation data
            const meshData = {
                polygons: polygons.map(polygon => ({
                    vertices: polygon.vertices,
                    mesh_size: localMeshSize,
                    boundary_refinement_factor: localBoundaryRefinementFactor,
                    materialId: polygon.materialId  // Changed from material_id to materialId
                })),
                materials: materialList.map(material => ({
                    id: material.id,
                    name: material.name,
                    color: material.color,
                    youngsModulus: material.youngsModulus,
                    poissonsRatio: material.poissonsRatio,
                    unitWeightSaturated: material.unitWeightSaturated,
                    unitWeightUnsaturated: material.unitWeightUnsaturated,
                    cohesion: material.cohesion,
                    frictionAngle: material.frictionAngle,
                    dilationAngle: material.dilationAngle,  // ✅ Added dilationAngle
                    thickness: material.thickness,
                    permeability: material.permeability,
                    voidRatio: material.voidRatio,
                    specificGravity: material.specificGravity
                })),
                pointLoads: pointLoadList  // Add point loads to mesh generation
            };

            console.log('Sending mesh generation request:', meshData);
            console.log('Debug info:', {
                polygonsCount: polygons.length,
                materialsCount: materialList.length,
                pointLoadsCount: pointLoadList.length,
                polygonMaterials: polygons.map(p => ({ id: p.id, materialId: p.materialId })),
                availableMaterials: materialList.map(m => ({ id: m.id, name: m.name }))
            });

            // Call backend API
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/mesh/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(meshData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            console.log('Mesh generation result:', result);

            if (result.success) {
                // Update global node and element lists
                if (result.nodes && result.elements) {
                    // Clear existing nodes and elements
                    clearMesh();
                    clearBoundaryConditions();
                    
                    // Add new nodes - backend returns [[x,y], [x,y], ...]
                    result.nodes.forEach((nodeCoords: number[], index: number) => {
                        addNode({
                            id: index + 1, // 1-based indexing for frontend
                            x: nodeCoords[0],
                            y: nodeCoords[1]
                        });
                    });
                    
                    // Add new elements - backend returns [[node1,node2,node3], ...] with 0-based indexing
                    result.elements.forEach((elementNodes: number[], index: number) => {
                        addElement({
                            id: index + 1, // 1-based indexing for frontend
                            node1: elementNodes[0] + 1, // Convert to 1-based indexing
                            node2: elementNodes[1] + 1, // Convert to 1-based indexing
                            node3: elementNodes[2] + 1  // Convert to 1-based indexing
                        });
                    });
                    
                    // Add boundary conditions from backend response
                    if (result.boundary_conditions) {
                        console.log('Boundary conditions from backend:', result.boundary_conditions);
                        
                        // Add full fixed boundary conditions
                        if (result.boundary_conditions.full_fixed) {
                            result.boundary_conditions.full_fixed.forEach((bc: any) => {
                                addBoundaryConditionFullFixed({
                                    node: bc.node + 1 // Convert to 1-based indexing
                                });
                            });
                        }
                        
                        // Add normal fixed boundary conditions
                        if (result.boundary_conditions.normal_fixed) {
                            result.boundary_conditions.normal_fixed.forEach((bc: any) => {
                                addBoundaryConditionNormalFixed({
                                    node: bc.node + 1 // Convert to 1-based indexing
                                });
                            });
                        }
                        
                        console.log(`Added ${result.boundary_conditions.full_fixed?.length || 0} full fixed BCs and ${result.boundary_conditions.normal_fixed?.length || 0} normal fixed BCs`);
                    }
                    
                    setShowMesh(true);
                    setMeshGenerationStatus('Mesh generated successfully!');
                    
                    console.log('🔄 About to assign nodes to point loads...');
                    console.log('📊 Current nodeList length:', nodeList.length);
                    console.log('📊 Current pointLoadList length:', pointLoadList.length);
                    
                    // Use point load assignments from backend if available
                    if (result.point_load_assignments && result.point_load_assignments.length > 0) {
                        console.log('🔄 Using point load assignments from backend:', result.point_load_assignments);
                        
                        // Update point loads with node assignments from backend
                        setPointLoadList((prevList: PointLoad[]) => prevList.map((pointLoad: PointLoad) => {
                            const assignment = result.point_load_assignments.find(
                                (assignment: any) => assignment.point_load_id === pointLoad.id
                            );
                            
                            if (assignment) {
                                console.log(`✅ Backend assigned node ${assignment.assigned_node_id} to point load ${pointLoad.id}`);
                                return { ...pointLoad, node: assignment.assigned_node_id };
                            }
                            return pointLoad;
                        }));
                    } else {
                        // Fallback to frontend assignment if backend doesn't provide assignments
                        console.log('🔄 No backend assignments, using frontend assignment...');
                        setTimeout(() => {
                            console.log('🔄 Delayed assignNodesToPointLoads call...');
                            console.log('📊 nodeList length after delay:', nodeList.length);
                            assignNodesToPointLoads();
                        }, 100);
                    }
                    
                    console.log('✅ Point load assignment completed');
                    
                    // Process element materials from backend response
                    if (result.element_materials && Array.isArray(result.element_materials)) {
                        console.log('🔧 Processing element materials from backend:', result.element_materials);
                        console.log('🔧 Element materials length:', result.element_materials.length);
                        console.log('🔧 First element material:', result.element_materials[0]);
                        
                        // Set element materials in context
                        setElementMaterials(result.element_materials);
                        console.log('✅ Element materials set successfully in MeshWizard');
                        
                        // Also set local state
                        setLocalElementMaterials(result.element_materials);
                        console.log('✅ Local element materials set successfully in MeshWizard');
                    } else {
                        console.log('❌ No element materials found in backend response');
                        console.log('result.element_materials:', result.element_materials);
                        setElementMaterials([]);
                        setLocalElementMaterials([]);
                    }
                    
                    setTimeout(() => {
                        setMeshGenerationStatus('');
                    }, 3000);
                } else {
                    throw new Error('Invalid response format: missing nodes or elements');
                }
            } else {
                throw new Error(result.error || 'Mesh generation failed');
            }

        } catch (error) {
            console.error('Error generating mesh:', error);
            setMeshGenerationStatus(`Error generating mesh: ${error instanceof Error ? error.message : 'Unknown error'}`);
            
            // Auto-clear error message after 5 seconds
            setTimeout(() => {
                setMeshGenerationStatus('');
            }, 5000);
        } finally {
            setIsGeneratingMesh(false);
        }
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

    const renderPolygons = () => {
        return polygons.map((polygon, index) => {
            const stageVertices = polygon.vertices.map(vertex => 
                worldToStage(vertex.x, vertex.y)
            );

            return (
                <Group key={`polygon-${polygon.id || index}`}>
                    {/* Polygon boundary */}
                    <Line
                        points={stageVertices.flatMap(v => [v.x, v.y])}
                        stroke="#2563eb"
                        strokeWidth={2}
                        closed={true}
                        fill="rgba(37, 99, 235, 0.1)"
                    />
                    
                    {/* Polygon vertices */}
                    {stageVertices.map((vertex, vertexIndex) => (
                        <Circle
                            key={`vertex-${index}-${vertexIndex}`}
                            x={vertex.x}
                            y={vertex.y}
                            radius={4}
                            fill="#2563eb"
                            stroke="#1e40af"
                            strokeWidth={1}
                        />
                    ))}
                </Group>
            );
        });
    };

    const renderMesh = () => {
        if (!showMesh || elementList.length === 0) return null;

        return (
            <Group>
                {/* Mesh elements */}
                {elementList.map((element) => {
                    const node1 = nodeList.find(n => n.id === element.node1);
                    const node2 = nodeList.find(n => n.id === element.node2);
                    const node3 = nodeList.find(n => n.id === element.node3);

                    if (!node1 || !node2 || !node3) return null;

                    const stageNode1 = worldToStage(node1.x, node1.y);
                    const stageNode2 = worldToStage(node2.x, node2.y);
                    const stageNode3 = worldToStage(node3.x, node3.y);

                    // Get material color for this element
                    const elementMaterial = elementMaterials.find(em => em.element_id === element.id);
                    const materialColor = elementMaterial?.material?.color || '#8B4513'; // Default brown color
                    const fillColor = elementMaterial ? materialColor : 'rgba(139, 69, 19, 0.1)'; // Default brown with transparency

                    return (
                        <Group key={`element-${element.id}`}>
                            {/* Triangle element outline */}
                            <Line
                                points={[
                                    stageNode1.x, stageNode1.y,
                                    stageNode2.x, stageNode2.y,
                                    stageNode3.x, stageNode3.y,
                                    stageNode1.x, stageNode1.y
                                ]}
                                stroke="#059669"
                                strokeWidth={1}
                            />
                            
                            {/* Gaussian Points with material colors */}
                            {showMaterialPoints && (() => {
                                // Calculate Gaussian Points for CST element
                                const gaussPoints = [
                                    { x: (stageNode1.x + stageNode2.x + stageNode3.x) / 3, y: (stageNode1.y + stageNode2.y + stageNode3.y) / 3 }, // Centroid
                                    { x: (stageNode1.x + stageNode2.x) / 2, y: (stageNode1.y + stageNode2.y) / 2 }, // Midpoint 1-2
                                    { x: (stageNode2.x + stageNode3.x) / 2, y: (stageNode2.y + stageNode3.y) / 2 }, // Midpoint 2-3
                                    { x: (stageNode3.x + stageNode1.x) / 2, y: (stageNode3.y + stageNode1.y) / 2 }  // Midpoint 3-1
                                ];
                                
                                return gaussPoints.map((gp, gpIndex) => (
                                    <Circle
                                        key={`gp-${element.id}-${gpIndex}`}
                                        x={gp.x}
                                        y={gp.y}
                                        radius={3}
                                        fill={materialColor}
                                        stroke="#000000"
                                        strokeWidth={1}
                                    />
                                ));
                            })()}
                        </Group>
                    );
                })}

                {/* Mesh nodes with boundary condition colors */}
                {nodeList.map((node) => {
                    const pos = worldToStage(node.x, node.y);
                    const isFixed = isNodeFixed(node.id);
                    const isNormalFixed = isNodeNormalFixed(node.id);

                    // Check for valid coordinates
                    if (isNaN(pos.x) || isNaN(pos.y)) {
                        console.warn(`Invalid coordinates for node ${node.id}:`, { x: node.x, y: node.y, pos });
                        return null;
                    }
                    
                    let fill = "#059669"; // Default green for mesh nodes
                    if (isFixed) fill = "#ff0000"; // Red for full fixed
                    else if (isNormalFixed) fill = "#00ff00"; // Green for normal fixed

                    return (
                        <Circle
                            key={`node-${node.id}`}
                            x={pos.x}
                            y={pos.y}
                            radius={2}
                            fill={fill}
                        />
                    );
                })}
            </Group>
        );
    };

    return (
        <div className="flex flex-row h-full w-full">
            {/* Left Panel - Mesh Settings */}
            <div className="w-1/5 border-r border-gray-200 overflow-y-auto">
                <div className="space-y-2">
                    {/* Mesh Settings Section */}
                    <div>
                        <h4 className="text-base font-semibold text-gray-800 p-3 border-b border-gray-200">
                            Mesh Settings
                        </h4>
                        
                        <div className="space-y-4 p-3 border-b border-gray-200">
                            {/* Mesh Size */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Mesh Size (m):
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    value={localMeshSize}
                                    onChange={(e) => setLocalMeshSize(parseFloat(e.target.value) || 0.5)}
                                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="0.5"
                                />
                                <p className="text-xs text-gray-500">
                                    Smaller values create finer mesh
                                </p>
                            </div>

                            {/* Boundary Refinement Factor */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-medium text-gray-700">
                                    Boundary Refinement Factor:
                                </label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="10"
                                    value={localBoundaryRefinementFactor}
                                    onChange={(e) => setLocalBoundaryRefinementFactor(parseFloat(e.target.value) || 1)}
                                    className="w-full p-2 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    placeholder="1.0"
                                />
                                <p className="text-xs text-gray-500">
                                    Higher values create finer mesh near boundaries
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3 p-3 border-b border-gray-200">
                        <button
                            onClick={generateMesh}
                            disabled={isGeneratingMesh || polygons.length === 0}
                            className="w-full px-4 py-2 bg-black text-white rounded hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400 disabled:cursor-not-allowed"
                        >
                            {isGeneratingMesh ? 'Generating...' : 'Generate Mesh'}
                        </button>
                        
                        <button
                            onClick={clearMesh}
                            disabled={!showMesh}
                            className="w-full px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-500 disabled:bg-gray-300 disabled:cursor-not-allowed"
                        >
                            Clear Mesh
                        </button>

                        {/* Material Points Toggle */}
                        <div className="flex items-center justify-between p-2 bg-gray-50 rounded border">
                            <span className="text-sm font-medium text-gray-700">Show Material Points</span>
                            <button
                                onClick={() => setShowMaterialPoints(!showMaterialPoints)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                                    showMaterialPoints ? 'bg-blue-600' : 'bg-gray-200'
                                }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                        showMaterialPoints ? 'translate-x-6' : 'translate-x-1'
                                    }`}
                                />
                            </button>
                        </div>
                    </div>

                    {/* Status */}
                    {meshGenerationStatus && (
                        <div className="p-3">
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded">
                                <p className="text-sm text-blue-700">{meshGenerationStatus}</p>
                            </div>
                        </div>
                    )}

                    {/* Polygon Info */}
                    <div className="p-3">
                        <h4 className="text-base font-semibold text-gray-800 mb-2 pb-2">
                            Geometry Info
                        </h4>
                        
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Polygons:</span>
                                <span className="font-medium">{polygons.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Nodes:</span>
                                <span className="font-medium">{nodeList.length}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Elements:</span>
                                <span className="font-medium">{elementList.length}</span>
                            </div>
                        </div>

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

            {/* Right Panel - Mesh Preview Canvas */}
            <div ref={containerRef} className="flex-1 relative h-full w-4/5">
                {/* Controls - EXACTLY like InputCanvas */}
                <div className="flex flex-row text-xs items-center gap-2 p-2">
                    <button
                        onClick={resetView} 
                        className="bg-gray-500 text-white border-none px-2 py-1 rounded-md mr-2">
                        Reset View
                    </button>
                    <button
                        onClick={verifyMaterials}
                        className="bg-green-600 text-white border-none px-2 py-1 rounded-md mr-2 hover:bg-green-700">
                        Verify Materials
                    </button>
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
                        {renderPolygons()}
                        
                        {/* Mesh */}
                        {renderMesh()}
                    </Layer>
                </Stage>

                {/* Canvas Instructions */}
                <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white px-3 py-2 rounded text-sm">
                    <p>Mouse wheel: Zoom | Middle/Right click: Pan</p>
                </div>
            </div>
        </div>
    );
};

export default MeshWizard; 