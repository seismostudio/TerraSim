import { useState, useRef, useEffect } from 'react';
import { useAppContext } from "../../App";
import { initialPolygonData } from "../../testdata";

interface Point {
    x: number;
    y: number;
}

interface Polygon {
    vertices: Point[];
    meshSize: number;
    boundaryRefinementFactor: number;
}

export default function PolygonInput() {
    const { 
        addNode, addElement, clearNodes, clearElements, 
        addBoundaryConditionFullFixed, addBoundaryConditionNormalFixed, 
        clearBoundaryConditions, clearResults, nodeList, elementList,
        meshSize, boundaryRefinementFactor, assignNodesToPointLoads
    } = useAppContext();
    const [polygon, setPolygon] = useState<Polygon>({
        vertices: [],
        meshSize: meshSize,
        boundaryRefinementFactor: boundaryRefinementFactor
    });
    const [isDrawing, setIsDrawing] = useState(false);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    // Update polygon when global mesh settings change
    useEffect(() => {
        setPolygon(prev => ({
            ...prev,
            meshSize: meshSize,
            boundaryRefinementFactor: boundaryRefinementFactor
        }));
    }, [meshSize, boundaryRefinementFactor]);

    const canvasWidth = 800;
    const canvasHeight = 600;

    // Transform screen coordinates to world coordinates
    const screenToWorld = (screenX: number, screenY: number): Point => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        
        const x = (screenX - rect.left) * (canvasWidth / rect.width);
        const y = (screenY - rect.top) * (canvasHeight / rect.height);
        
        // Transform to world coordinates (assuming 0-20 range)
        return {
            x: (x / canvasWidth) * 20,
            y: ((canvasHeight - y) / canvasHeight) * 20
        };
    };

    // Transform world coordinates to screen coordinates
    const worldToScreen = (worldX: number, worldY: number): Point => {
        return {
            x: (worldX / 20) * canvasWidth,
            y: canvasHeight - (worldY / 20) * canvasHeight
        };
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        const point = screenToWorld(e.clientX, e.clientY);
        
        if (!isDrawing) {
            setIsDrawing(true);
            setPolygon(prev => ({
                ...prev,
                vertices: [point]
            }));
        } else {
            setPolygon(prev => ({
                ...prev,
                vertices: [...prev.vertices, point]
            }));
        }
    };

    const handleDoubleClick = () => {
        if (isDrawing && polygon.vertices.length >= 3) {
            setIsDrawing(false);
            // Close the polygon
            setPolygon(prev => ({
                ...prev,
                vertices: [...prev.vertices, prev.vertices[0]]
            }));
        }
    };

    const clearPolygon = () => {
        setPolygon({
            vertices: [],
            meshSize: meshSize,
            boundaryRefinementFactor: boundaryRefinementFactor
        });
        setIsDrawing(false);
    };

    const loadSamplePolygon = (polygonType: string) => {
        let selectedPolygon;
        if (polygonType === 'initial') {
            selectedPolygon = initialPolygonData;
        } else {
            // For now, use initialPolygonData for all sample types
            selectedPolygon = initialPolygonData;
        }
        
        setPolygon({
            vertices: selectedPolygon.vertices,
            meshSize: selectedPolygon.meshSize,
            boundaryRefinementFactor: selectedPolygon.boundaryRefinementFactor
        });
        setIsDrawing(false);
    };

    const generateMesh = async () => {
        if (polygon.vertices.length < 3) {
            alert('Please draw a polygon first (at least 3 vertices)');
            return;
        }

        try {
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            
            const requestData = {
                polygon: {
                    vertices: polygon.vertices,
                    mesh_size: polygon.meshSize,
                    boundary_refinement_factor: polygon.boundaryRefinementFactor
                }
            };

            const response = await fetch(`${API_URL}/api/mesh/generate`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(requestData)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();
            
            if (result.success) {
                console.log('Mesh generation result:', result);
                console.log('Nodes count:', result.nodes.length);
                console.log('Elements count:', result.elements.length);
                console.log('Boundary conditions:', result.boundary_conditions);
                
                // Clear existing nodes and elements
                console.log('Clearing existing data...');
                clearNodes();
                clearElements();
                clearBoundaryConditions();
                clearResults(); // Clear previous results
                
                // Add new nodes
                console.log('Adding nodes...');
                result.nodes.forEach((node: any, index: number) => {
                    const newNode = {
                        id: index + 1,
                        x: node[0],
                        y: node[1]
                    };
                    console.log(`Adding node ${index + 1}:`, newNode);
                    addNode(newNode);
                });

                // Add new elements
                console.log('Adding elements...');
                result.elements.forEach((element: any, index: number) => {
                    const newElement = {
                        id: index + 1,
                        node1: element[0] + 1,
                        node2: element[1] + 1,
                        node3: element[2] + 1
                    };
                    console.log(`Adding element ${index + 1}:`, newElement);
                    addElement(newElement);
                });

                // Add automatic boundary conditions
                if (result.boundary_conditions) {
                    console.log('Adding automatic boundary conditions...');
                    
                    // Add full fixed boundary conditions (y_min nodes)
                    if (result.boundary_conditions.full_fixed) {
                        result.boundary_conditions.full_fixed.forEach((nodeIndex: number) => {
                            const bc = { node: nodeIndex + 1 }; // Convert to 1-based indexing
                            console.log('Adding full fixed BC:', bc);
                            addBoundaryConditionFullFixed(bc);
                        });
                    }
                    
                    // Add normal fixed boundary conditions (x_min/x_max nodes)
                    if (result.boundary_conditions.normal_fixed) {
                        result.boundary_conditions.normal_fixed.forEach((nodeIndex: number) => {
                            const bc = { node: nodeIndex + 1 }; // Convert to 1-based indexing
                            console.log('Adding normal fixed BC:', bc);
                            addBoundaryConditionNormalFixed(bc);
                        });
                    }
                }

                console.log('Mesh generation completed!');
                const bcInfo = result.boundary_conditions ? 
                    `BC: ${result.boundary_conditions.full_fixed?.length || 0} full fixed, ${result.boundary_conditions.normal_fixed?.length || 0} normal fixed` : 
                    'BC: None';
                
                // Assign nodes to point loads after mesh generation
                assignNodesToPointLoads();
                
                alert(`Mesh generated successfully!\n\nNodes: ${result.nodes.length}\nElements: ${result.elements.length}\n${bcInfo}\n\nBoundary conditions automatically applied:\n• y_min nodes: Full fixed\n• x_min/x_max nodes: Normal fixed`);
            } else {
                console.error('Mesh generation failed:', result.error);
                alert(`Mesh generation failed: ${result.error}`);
            }
        } catch (error) {
            console.error('Error generating mesh:', error);
            alert(`Error generating mesh: ${error}`);
        }
    };

    const drawCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear canvas
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);

        // Draw grid
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 0.5;
        for (let x = 0; x <= canvasWidth; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
            ctx.stroke();
        }
        for (let y = 0; y <= canvasHeight; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvasWidth, y);
            ctx.stroke();
        }

        // Draw polygon vertices and edges
        if (polygon.vertices.length > 0) {
            ctx.strokeStyle = '#3b82f6';
            ctx.fillStyle = 'rgba(59, 130, 246, 0.1)';
            ctx.lineWidth = 2;

            ctx.beginPath();
            const firstPoint = worldToScreen(polygon.vertices[0].x, polygon.vertices[0].y);
            ctx.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < polygon.vertices.length; i++) {
                const point = worldToScreen(polygon.vertices[i].x, polygon.vertices[i].y);
                ctx.lineTo(point.x, point.y);
            }

            if (polygon.vertices.length >= 3) {
                ctx.closePath();
                ctx.fill();
            }
            ctx.stroke();

            // Draw vertices
            ctx.fillStyle = '#3b82f6';
            polygon.vertices.forEach(vertex => {
                const point = worldToScreen(vertex.x, vertex.y);
                ctx.beginPath();
                ctx.arc(point.x, point.y, 4, 0, 2 * Math.PI);
                ctx.fill();
            });
        }

        // Draw boundary condition indicators if mesh is generated
        if (nodeList.length > 0 && elementList.length > 0) {
            // Calculate bounding box for boundary condition detection
            const minY = Math.min(...nodeList.map(n => n.y));
            const minX = Math.min(...nodeList.map(n => n.x));
            const maxX = Math.max(...nodeList.map(n => n.x));
            
            // Draw boundary condition indicators
            nodeList.forEach(node => {
                const point = worldToScreen(node.x, node.y);
                
                // Check if node is at y_min (full fixed)
                if (Math.abs(node.y - minY) < 1e-6) {
                    ctx.fillStyle = '#dc2626'; // Red for full fixed
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                }
                // Check if node is at x_min or x_max (normal fixed)
                else if (Math.abs(node.x - minX) < 1e-6 || Math.abs(node.x - maxX) < 1e-6) {
                    ctx.fillStyle = '#2563eb'; // Blue for normal fixed
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
                    ctx.fill();
                }
            });
        }
    };

    useEffect(() => {
        drawCanvas();
    }, [polygon, nodeList, elementList]);

    return (
        <div className="flex flex-col h-full w-full bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-3 border-b border-gray-200 bg-gray-50">
                <h3 className="text-sm font-semibold text-gray-700">Polygon Input</h3>
                <p className="text-xs text-gray-500">
                    Click to add vertices. Double-click to close polygon.
                </p>
            </div>

            <div className="flex-1 p-4">
                <div className="mb-4 space-y-3">
                    <div className="flex gap-2 flex-wrap">
                        <button
                            onClick={clearPolygon}
                            className="px-3 py-1 text-xs rounded bg-gray-500 text-white"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('initial')}
                            className="px-3 py-1 text-xs rounded bg-blue-500 text-white"
                        >
                            Load Initial
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('rectangle')}
                            className="px-3 py-1 text-xs rounded bg-green-500 text-white"
                        >
                            Rectangle
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('triangle')}
                            className="px-3 py-1 text-xs rounded bg-yellow-500 text-white"
                        >
                            Triangle
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('lShape')}
                            className="px-3 py-1 text-xs rounded bg-purple-500 text-white"
                        >
                            L-Shape
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('hexagon')}
                            className="px-3 py-1 text-xs rounded bg-pink-500 text-white"
                        >
                            Hexagon
                        </button>
                        <button
                            onClick={() => loadSamplePolygon('complex')}
                            className="px-3 py-1 text-xs rounded bg-indigo-500 text-white"
                        >
                            Complex
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Mesh Size
                            </label>
                            <input
                                type="number"
                                value={polygon.meshSize}
                                onChange={(e) => setPolygon(prev => ({
                                    ...prev,
                                    meshSize: parseFloat(e.target.value)
                                }))}
                                step="0.1"
                                min="0.1"
                                className="w-full px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Boundary Refinement Factor
                            </label>
                            <input
                                type="number"
                                value={polygon.boundaryRefinementFactor}
                                onChange={(e) => setPolygon(prev => ({
                                    ...prev,
                                    boundaryRefinementFactor: parseFloat(e.target.value)
                                }))}
                                step="0.1"
                                min="0.1"
                                max="1.0"
                                className="w-full px-2 py-1 text-xs text-gray-700 border border-gray-300 rounded"
                            />
                        </div>
                    </div>

                    <button
                        onClick={generateMesh}
                        disabled={polygon.vertices.length < 3}
                        className="w-full px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        Generate Mesh
                    </button>

                    <div className="text-xs text-gray-600 bg-gray-50 p-2 rounded">
                        <p className="font-medium mb-1">Automatic Boundary Conditions:</p>
                        <ul className="space-y-1">
                            <li>• <span className="text-red-600">Red</span>: Full fixed (y_min nodes)</li>
                            <li>• <span className="text-blue-600">Blue</span>: Normal fixed (x_min/x_max nodes)</li>
                        </ul>
                    </div>
                </div>

                <div className="border border-gray-300 rounded bg-gray-50">
                    <canvas
                        ref={canvasRef}
                        width={canvasWidth}
                        height={canvasHeight}
                        onMouseDown={handleMouseDown}
                        onDoubleClick={handleDoubleClick}
                        className="w-full h-full cursor-crosshair"
                        style={{ maxHeight: '400px' }}
                    />
                </div>

                <div className="mt-3 text-xs text-gray-600">
                    <div className="flex flex-wrap gap-4">
                        <div className="flex items-center gap-1">
                            <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                            <span>Polygon Boundary</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 