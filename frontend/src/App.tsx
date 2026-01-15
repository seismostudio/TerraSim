import { useState, useEffect } from 'react'
import './App.css'
import Header from './component/header'
import InputWizard from './component/inputwizard'
import TabWizard from './component/tabwizard'
import MeshWizard from './component/MeshWizard'
import StagingWizard from './component/StagingWizard'
import VisualizationCanvas from './component/VisualizationCanvas'
import { createContext, useContext } from 'react'
// Removed PolygonProvider import - using only AppContext

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
    active?: boolean;  // ✅ NEW: Element active status for sequential analysis
}

interface BoundaryConditionFullFixed {
    node: number;
}

interface BoundaryConditionNormalFixed {
    node: number;
}

interface Load {
    node: number;
    fx: number;
    fy: number;
}

interface PointLoad {
    id: string;
    x: number;
    y: number;
    fx: number;
    fy: number;
    node?: number; // Node ID (optional, will be assigned after mesh generation)
}

interface Material {
    id?: string;
    name: string;
    color: string;
    youngsModulus: number;
    poissonsRatio: number;
    unitWeightSaturated: number;  // ✅ Gamma saturated
    unitWeightUnsaturated: number;  // ✅ Gamma unsaturated
    cohesion: number;
    frictionAngle: number;
    dilationAngle: number;  // ✅ Dilation angle (ψ) for plastic flow
    thickness: number;
    permeability: number;
    voidRatio: number;
    specificGravity: number;
}

interface Point {
    x: number;
    y: number;
}

interface WaterLevel {
    id: string;
    points: Point[];
    isActive: boolean;
}

interface Polygon {
    vertices: Point[];
    meshSize: number;
    boundaryRefinementFactor: number;
    id?: string;
    materialId?: string;
}

// ✅ NEW: Stage interface for better type safety
interface Stage {
    id: string;
    name: string;
    activePolygons: string[];
    activePointLoads: string[];
    activeWaterLevels: string[];
    calculationType: 'FEA' | 'K0';
}

interface AppContextType {
    nodeList: Node[];
    addNode: (node: Node) => void;
    clearNodes: () => void;
    elementList: Element[];
    addElement: (element: Element) => void;
    clearElements: () => void;
    clearMesh: () => void;
    boundaryConditionListFullFixed: BoundaryConditionFullFixed[];
    addBoundaryConditionFullFixed: (boundaryCondition: BoundaryConditionFullFixed) => void;
    clearBoundaryConditions: () => void;
    boundaryConditionListNormalFixed: BoundaryConditionNormalFixed[];
    addBoundaryConditionNormalFixed: (boundaryCondition: BoundaryConditionNormalFixed) => void;
    loadList: Load[];
    addLoad: (load: Load) => void;
    pointLoadList: PointLoad[];
    addPointLoad: (pointLoad: PointLoad) => void;
    updatePointLoad: (id: string, pointLoad: PointLoad) => void;
    deletePointLoad: (id: string) => void;
    clearPointLoads: () => void;
    assignNodesToPointLoads: () => void;
    setPointLoadList: React.Dispatch<React.SetStateAction<PointLoad[]>>;
    materialList: Material[];
    addMaterial: (material: Material) => void;
    updateMaterial: (materialId: string, updatedMaterial: Material) => void;
    deleteMaterial: (materialId: string) => void;
    assignMaterialToPolygon: (polygonId: string, materialId: string) => void;
    useK0Procedure: boolean;
    setUseK0Procedure: (use: boolean) => void;
    waterLevel: number;
    setWaterLevel: (level: number) => void;
    waterLevelList: WaterLevel[];
    addWaterLevel: (waterLevel: WaterLevel) => void;
    updateWaterLevel: (id: string, waterLevel: WaterLevel) => void;
    deleteWaterLevel: (id: string) => void;
    clearWaterLevels: () => void;
    setWaterLevelList: React.Dispatch<React.SetStateAction<WaterLevel[]>>;
    selectedWaterLevelId: string | null;
    setSelectedWaterLevelId: (id: string | null) => void;
    interpolationMethod: string;
    setInterpolationMethod: (method: string) => void;
    // Stage management
    saveStages: (stages: Stage[]) => void;
    getStages: () => Stage[];
    meshSize: number;
    setMeshSize: (size: number) => void;
    boundaryRefinementFactor: number;
    setBoundaryRefinementFactor: (factor: number) => void;
    runFEAnalysis: () => Promise<void>;
    clearResults: () => void;
    isAnalyzing: boolean;
    inputWizard: boolean;
    setInputWizard: (wizard: boolean) => void;
    meshWizard: boolean;
    setMeshWizard: (wizard: boolean) => void;
    stagingWizard: boolean;
    setStagingWizard: (wizard: boolean) => void;
    results: any;
    setResultsWizard: (wizard: boolean) => void;
    resultsWizard: boolean;
    polygons: Polygon[];
    setPolygons: React.Dispatch<React.SetStateAction<Polygon[]>>;
    selectedPolygonId: string | null;
    setSelectedPolygonId: (id: string | null) => void;
    selectedPointLoadId: string | null;
    setSelectedPointLoadId: (id: string | null) => void;
    elementMaterials: Array<{element_id: number, material: Material}>;
    setElementMaterials: React.Dispatch<React.SetStateAction<Array<{element_id: number, material: Material}>>>;
    showMesh: boolean;
    setShowMesh: (show: boolean) => void;
    // General settings
    theme: 'light' | 'dark';
    setTheme: (theme: 'light' | 'dark') => void;
    snapToGrid: boolean;
    setSnapToGrid: (snap: boolean) => void;
    gridSize: number;
    setGridSize: (size: number) => void;
    showGrid: boolean;
    setShowGrid: (show: boolean) => void;
    showAxis: boolean;
    setShowAxis: (show: boolean) => void;
    showAxisLabels: boolean;
    setShowAxisLabels: (show: boolean) => void;

}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const useAppContext = () => {
    const context = useContext(AppContext);
    if (!context) {
        throw new Error('useAppContext must be used within AppProvider');
    }
    return context;
};

function App() {
    const [nodeList, setNodeList] = useState<Node[]>([]);
    const [elementList, setElementList] = useState<Element[]>([]);
    
    // Removed excessive console.log statements to prevent console spam
    const [boundaryConditionListFullFixed, setBoundaryConditionListFullFixed] = useState<BoundaryConditionFullFixed[]>([]);
    const [boundaryConditionListNormalFixed, setBoundaryConditionListNormalFixed] = useState<BoundaryConditionNormalFixed[]>([]);
    const [loadList, setLoadList] = useState<Load[]>([]);
    const [pointLoadList, setPointLoadList] = useState<PointLoad[]>(() => {
        const saved = localStorage.getItem('pointLoadList');
        console.log('=== POINT LOAD INITIALIZATION ===');
        console.log('localStorage saved:', saved);
        const parsed = saved ? JSON.parse(saved) : [];
        console.log('parsed pointLoadList:', parsed);
        console.log('parsed length:', parsed.length);
        return parsed;
    });
    const [materialList, setMaterialList] = useState<Material[]>(() => {
        const saved = localStorage.getItem('materialList');
        return saved ? JSON.parse(saved) : [];
    });
    const [useK0Procedure, setUseK0Procedure] = useState<boolean>(false);
    const [waterLevel, setWaterLevel] = useState<number>(0.0);
    const [waterLevelList, setWaterLevelList] = useState<WaterLevel[]>(() => {
        const saved = localStorage.getItem('waterLevelList');
        return saved ? JSON.parse(saved) : [];
    });
    const [selectedWaterLevelId, setSelectedWaterLevelId] = useState<string | null>(null);
    const [interpolationMethod, setInterpolationMethod] = useState<string>("area_weighted");
    const [meshSize, setMeshSize] = useState<number>(1.0);
    const [boundaryRefinementFactor, setBoundaryRefinementFactor] = useState<number>(0.5);
    const [results, setResults] = useState<any>(null);
    const [inputWizard, setInputWizard] = useState<boolean>(true);
    const [meshWizard, setMeshWizard] = useState<boolean>(false);
    const [stagingWizard, setStagingWizard] = useState<boolean>(false);
    const [resultsWizard, setResultsWizard] = useState<boolean>(false);
    const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
    const [selectedStageIndex, setSelectedStageIndex] = useState<number>(0);
    const [polygons, setPolygons] = useState<Polygon[]>(() => {
        const saved = localStorage.getItem('polygons');
        return saved ? JSON.parse(saved) : [];
    });
    const [selectedPolygonId, setSelectedPolygonId] = useState<string | null>(null);
    const [selectedPointLoadId, setSelectedPointLoadId] = useState<string | null>(null);
    const [elementMaterials, setElementMaterials] = useState<Array<{element_id: number, material: Material}>>([]);
    const [showMesh, setShowMesh] = useState<boolean>(false);
    
    // General settings state
    const [theme, setTheme] = useState<'light' | 'dark'>('light');
    const [snapToGrid, setSnapToGrid] = useState<boolean>(true);
    const [gridSize, setGridSize] = useState<number>(0.5);
    const [showGrid, setShowGrid] = useState<boolean>(true);
    const [showAxis, setShowAxis] = useState<boolean>(true);
    const [showAxisLabels, setShowAxisLabels] = useState<boolean>(true);


    // Debug: Monitor pointLoadList changes
    useEffect(() => {
        console.log('📊 pointLoadList changed:', pointLoadList);
    }, [pointLoadList]);

    // Debug: Monitor elementMaterials changes
    useEffect(() => {
        console.log('🔧 elementMaterials changed:', elementMaterials);
        console.log('🔧 elementMaterials length:', elementMaterials.length);
    }, [elementMaterials]);

    // Debug: Monitor nodeList changes
    useEffect(() => {
        console.log('📊 nodeList changed:', nodeList);
    }, [nodeList]);

    // Save point loads to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('pointLoadList', JSON.stringify(pointLoadList));
    }, [pointLoadList]);

    // Save polygons to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('polygons', JSON.stringify(polygons));
    }, [polygons]);

    // Save materials to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('materialList', JSON.stringify(materialList));
    }, [materialList]);

    // Save water levels to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('waterLevelList', JSON.stringify(waterLevelList));
    }, [waterLevelList]);

    const addNode = (node: Node) => {
        setNodeList(prevList => [...prevList, node]);
    };

    const addElement = (element: Element) => {
        setElementList(prevList => [...prevList, element]);
    };

    const clearNodes = () => {
        setNodeList([]);
    };

    const clearElements = () => {
        setElementList([]);
    };

    const clearMesh = () => {
        setNodeList([]);
        setElementList([]);
        setShowMesh(false);
        setBoundaryConditionListFullFixed([]);
        setBoundaryConditionListNormalFixed([]);
        // Don't clear point loads - they should persist after mesh generation
        // setPointLoadList([]); // Removed this line
    };

    const clearBoundaryConditions = () => {
        setBoundaryConditionListFullFixed([]);
        setBoundaryConditionListNormalFixed([]);
    };

    const clearResults = () => {
        setResults(null);
        setIsAnalyzing(false);
        setSelectedStageIndex(0);
    };

    const addBoundaryConditionFullFixed = (boundaryCondition: BoundaryConditionFullFixed) => {
        setBoundaryConditionListFullFixed(prevList => {
            return [...prevList, boundaryCondition];
        });
    };

    const addBoundaryConditionNormalFixed = (boundaryCondition: BoundaryConditionNormalFixed) => {
        setBoundaryConditionListNormalFixed(prevList => {
            return [...prevList, boundaryCondition];
        });
    };

    const addLoad = (load: Load) => {
        setLoadList([...loadList, load]);
    };

    const addPointLoad = (pointLoad: PointLoad) => {
        setPointLoadList(prevList => [...prevList, pointLoad]);
    };

    const updatePointLoad = (id: string, pointLoad: PointLoad) => {
        setPointLoadList(prevList => prevList.map(pl => pl.id === id ? pointLoad : pl));
    };

    const deletePointLoad = (id: string) => {
        setPointLoadList(prevList => prevList.filter(pl => pl.id !== id));
    };

    const clearPointLoads = () => {
        setPointLoadList([]);
    };

    // Water Level functions
    const addWaterLevel = (waterLevel: WaterLevel) => {
        setWaterLevelList(prevList => [...prevList, waterLevel]);
    };

    const updateWaterLevel = (id: string, waterLevel: WaterLevel) => {
        setWaterLevelList(prevList => prevList.map(wl => 
            wl.id === id ? waterLevel : wl
        ));
    };

    const deleteWaterLevel = (id: string) => {
        setWaterLevelList(prevList => prevList.filter(wl => wl.id !== id));
    };

    const clearWaterLevels = () => {
        setWaterLevelList([]);
    };

    // Stage management functions
    const saveStages = (stages: Stage[]) => {
        localStorage.setItem('stages', JSON.stringify(stages));
    };

    const getStages = (): Stage[] => {
        const savedStages = localStorage.getItem('stages');
        return savedStages ? JSON.parse(savedStages) : [
            {
                id: 'initial',
                name: 'Initial Stage',
                activePolygons: [],
                activePointLoads: [],
                activeWaterLevels: [],
                calculationType: 'FEA'
            }
        ];
    };

    // Helper function to check if a point is inside a polygon
    const isPointInPolygon = (point: Point, polygon: Polygon): boolean => {
        const vertices = polygon.vertices;
        if (vertices.length < 3) return false;
        
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
        
        return inside;
    };
    
    const calculateGaussianPoints = (node1: Node, node2: Node, node3: Node): Point[] => {
        // Calculate Gaussian Points for CST element using optimal Gauss points
        // Optimal Gauss points for CST: (1/6, 1/6, 2/3), (1/6, 2/3, 1/6), (2/3, 1/6, 1/6)
        return [
            // GP1: (1/6, 1/6, 2/3) - barycentric coordinates
            {
                x: (1/6) * node1.x + (1/6) * node2.x + (2/3) * node3.x,
                y: (1/6) * node1.y + (1/6) * node2.y + (2/3) * node3.y
            },
            // GP2: (1/6, 2/3, 1/6) - barycentric coordinates
            {
                x: (1/6) * node1.x + (2/3) * node2.x + (1/6) * node3.x,
                y: (1/6) * node1.y + (2/3) * node2.y + (1/6) * node3.y
            },
            // GP3: (2/3, 1/6, 1/6) - barycentric coordinates
            {
                x: (2/3) * node1.x + (1/6) * node2.x + (1/6) * node3.x,
                y: (2/3) * node1.y + (1/6) * node2.y + (1/6) * node3.y
            }
        ];
    };

    const assignNodesToPointLoads = () => {
        console.log('🔄 Assigning nodes to point loads...');
        console.log('📊 Current point loads:', pointLoadList);
        console.log('📊 Available nodes:', nodeList);
        
        if (nodeList.length === 0) {
            console.log('❌ No nodes available for assignment');
            return;
        }
        
        if (pointLoadList.length === 0) {
            console.log('❌ No point loads to assign');
            return;
        }
        
        setPointLoadList(prevList => {
            console.log('🔄 Updating point load list...');
            console.log('📊 Previous list:', prevList);
            
            const updatedList = prevList.map(pointLoad => {
                // Always reassign node (even if already assigned) to handle mesh regeneration
                // Find the closest node to the point load's coordinates
                let closestNode: Node | null = null;
                let minDistance = Infinity;
                
                nodeList.forEach((node: Node) => {
                    const distance = Math.sqrt(
                        Math.pow(node.x - pointLoad.x, 2) + Math.pow(node.y - pointLoad.y, 2)
                    );
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestNode = node;
                    }
                });
                
                if (closestNode) {
                    const updatedPointLoad = { ...pointLoad, node: (closestNode as Node).id };
                    console.log(`✅ Assigned node ${(closestNode as Node).id} to point load ${pointLoad.id} (distance: ${minDistance.toFixed(4)})`);
                    return updatedPointLoad;
                } else {
                    console.log(`❌ No node found for point load ${pointLoad.id}`);
                    return pointLoad;
                }
            });
            
            console.log('📊 Updated list:', updatedList);
            return updatedList;
        });
    };

    const addMaterial = (material: Material) => {
        setMaterialList([...materialList, material]);
    };

    const deleteMaterial = (materialId: string) => {
        setMaterialList(prevList => 
            prevList.filter(material => material.id !== materialId)
        );
    };

    const updateMaterial = (materialId: string, updatedMaterial: Material) => {
        setMaterialList(prevList => prevList.map(material => 
            material.id === materialId ? { ...updatedMaterial, id: materialId } : material
        ));
    };

    const assignMaterialToPolygon = (polygonId: string, materialId: string) => {
        setPolygons(prevPolygons => prevPolygons.map(polygon => 
            (polygon.id || `polygon_${prevPolygons.indexOf(polygon)}`) === polygonId 
                ? { ...polygon, materialId } 
                : polygon
        ));
    };

    const runFEAnalysis = async () => {
            setIsAnalyzing(true);

        try {
            console.log("🚀 Starting Sequential Analysis...");
            
            // Get stages from localStorage or use default
            const savedStages = localStorage.getItem('stages');
            const stages = savedStages ? JSON.parse(savedStages) : [
                {
                    id: 'initial',
                    name: 'Initial Stage',
                    activePolygons: [],
                    activePointLoads: [],
                    activeWaterLevels: [],
                    calculationType: 'FEA'
                }
            ];
            
            console.log("📋 Stages to analyze:", stages);
            
            // Prepare sequential analysis request
            const sequentialStages = [];
            
            for (let i = 0; i < stages.length; i++) {
                const stage = stages[i];
                console.log(`\n🔧 Preparing stage ${i + 1}/${stages.length}: ${stage.name}`);
            
        // Get active objects for this stage
        const activePolygons = polygons.filter(polygon => 
            stage.activePolygons.includes(polygon.id || `polygon_${polygons.indexOf(polygon)}`)
        );
        const activePointLoads = pointLoadList.filter(pointLoad => 
            stage.activePointLoads.includes(pointLoad.id)
        );
        const activeWaterLevels = waterLevelList.filter(waterLevel => 
            stage.activeWaterLevels.includes(waterLevel.id)
        );
        
        // Get water level for this stage
        let stageWaterLevel = waterLevel;
        if (activeWaterLevels.length > 0) {
            const activeWaterLevel = activeWaterLevels[0];
            stageWaterLevel = activeWaterLevel.points[0]?.y || waterLevel;
        }
        
        // Get water level points for interpolation
        const waterLevelPoints = activeWaterLevels.length > 0 ? 
            activeWaterLevels[0].points.map(point => ({ x: point.x, y: point.y })) : [];
        
        // Convert active point loads to node loads for analysis
        const nodeLoadsFromPointLoads = activePointLoads
                    .filter(pointLoad => pointLoad.node)
                .map(pointLoad => ({
                    node: pointLoad.node!,
                    fx: pointLoad.fx,
                    fy: pointLoad.fy
                }));
            
            // Combine regular loads with node loads from point loads
            const allLoads = [...loadList, ...nodeLoadsFromPointLoads];
            
        // Filter elements based on active polygons using Gaussian Points
        const activePolygonIds = activePolygons.map(polygon => polygon.id || `polygon_${polygons.indexOf(polygon)}`);
        const activeElements = elementList.filter(element => {
            // Get element nodes
            const node1 = nodeList.find(n => n.id === element.node1);
            const node2 = nodeList.find(n => n.id === element.node2);
            const node3 = nodeList.find(n => n.id === element.node3);
            
            if (!node1 || !node2 || !node3) return false;
            
            // Calculate Gaussian Points for CST element
            const gaussPoints = calculateGaussianPoints(node1, node2, node3);
            
            // Check if any Gaussian Point is inside any active polygon
            return gaussPoints.some(gp => {
                return activePolygons.some(polygon => {
                    return isPointInPolygon(gp, polygon);
                });
            });
        });
        
        // Filter element materials based on active elements
        const activeElementMaterials = elementMaterials.filter(em => 
            activeElements.some(element => element.id === em.element_id)
        );
        
                // ✅ AUTOMATIC: Generate element_active array based on active polygons
                let element_active = elementList.map(element => {
                    // Get element nodes
                    const node1 = nodeList.find(n => n.id === element.node1);
                    const node2 = nodeList.find(n => n.id === element.node2);
                    const node3 = nodeList.find(n => n.id === element.node3);
                    
                    if (!node1 || !node2 || !node3) return false;
                    
                    // Calculate Gaussian Points for CST element
                    const gaussPoints = calculateGaussianPoints(node1, node2, node3);
                    
                    // Check if any Gaussian Point is inside any active polygon
                    return gaussPoints.some(gp => {
                        return activePolygons.some(polygon => {
                            return isPointInPolygon(gp, polygon);
                        });
                    });
                });
                
                // ✅ SAFETY CHECK: Ensure element_active is a valid array
                if (!Array.isArray(element_active) || element_active.length === 0) {
                    console.warn(`⚠️ Stage ${stage.name}: element_active is invalid, using all elements as active`);
                    // Default to all elements active if calculation fails
                    element_active = elementList.map(() => true);
                    console.log(`⚠️ Stage ${stage.name}: Using fallback element_active:`, element_active);
                }
                
                // ✅ AUTOMATIC: Get previous stage active elements for non-initial stages
                let previous_stage_active_elements: boolean[] = [];
                if (i > 0) {
                    const previousStage = stages[i - 1];
                    // Calculate previous stage element_active based on previous stage's active polygons
                    const previousActivePolygons = polygons.filter(polygon => 
                        previousStage.activePolygons.includes(polygon.id || `polygon_${polygons.indexOf(polygon)}`)
                    );
                    
                    previous_stage_active_elements = elementList.map(element => {
                        const node1 = nodeList.find(n => n.id === element.node1);
                        const node2 = nodeList.find(n => n.id === element.node2);
                        const node3 = nodeList.find(n => n.id === element.node3);
                        
                        if (!node1 || !node2 || !node3) return false;
                        
                        const gaussPoints = calculateGaussianPoints(node1, node2, node3);
                        return gaussPoints.some(gp => {
                            return previousActivePolygons.some(polygon => {
                                return isPointInPolygon(gp, polygon);
                            });
                        });
                    });
                }
                
                console.log(`🔧 Stage ${stage.name} element_active: ${element_active.filter(a => a).length}/${element_active.length} active`);
                console.log(`🔧 Stage ${stage.name} previous_stage_active_elements: ${previous_stage_active_elements.length} elements`);
                console.log(`🔧 Stage ${stage.name} element_active array:`, element_active);
                console.log(`🔧 Stage ${stage.name} element_active array length:`, element_active.length);
                console.log(`🔧 Stage ${stage.name} element_active array type:`, typeof element_active);
                console.log(`🔧 Stage ${stage.name} element_active is array:`, Array.isArray(element_active));
                
                // Prepare stage configuration for sequential analysis
                const stageConfig = {
                    stage_id: stage.id,
                    stage_name: stage.name,
                    stage_sequence: i + 1,
                    calculation_type: stage.calculationType,
                    is_initial_stage: i === 0,
                    nodes: nodeList,
                    elements: activeElements,
                    boundaryConditionsFullFixed: boundaryConditionListFullFixed,
                    boundaryConditionsNormalFixed: boundaryConditionListNormalFixed,
                    loads: allLoads,
                    materials: activeElementMaterials,
                    water_level: stageWaterLevel,
                    water_level_points: waterLevelPoints,
                    interpolation_method: interpolationMethod,
                    active_polygons: activePolygonIds,
                    active_point_loads: activePointLoads.map(pl => pl.id),
                    active_water_levels: activeWaterLevels.map(wl => wl.id),
                    element_active: element_active,  // ✅ NEW: Element active status array
                    previous_stage_active_elements: previous_stage_active_elements  // ✅ NEW: Previous stage active elements
                };
                
                sequentialStages.push(stageConfig);
                console.log(`✅ Stage ${stage.name} prepared for sequential analysis`);
            }
            
            // Prepare sequential analysis request
            const sequentialRequest = {
                stages: sequentialStages,
                continue_from_previous: true
            };
            
            console.log("📤 Sending sequential analysis request to API...");
            console.log("📤 Sequential request stages:", sequentialStages);
            console.log("📤 First stage element_active:", sequentialStages[0]?.element_active);
            console.log("📤 First stage element_active length:", sequentialStages[0]?.element_active?.length);
            console.log("📤 JSON stringified request preview:", JSON.stringify(sequentialRequest).substring(0, 500) + "...");
            
            // Call sequential analysis API
            const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const response = await fetch(`${API_URL}/api/sequential/analyze`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(sequentialRequest)
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API request failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const sequentialResponse = await response.json();
            
            if (!sequentialResponse.success) {
                throw new Error(`Sequential analysis failed: ${sequentialResponse.error || sequentialResponse.message}`);
            }
            
            console.log("✅ Sequential analysis completed successfully!");
            console.log("📊 Sequential analysis results:", sequentialResponse);
                
            // Store results in the same format as before for compatibility
            const stageResults = sequentialResponse.stage_results || [];
            setResults({
                stages: stageResults,
                totalStages: stages.length,
                completedAt: new Date().toISOString(),
                // Add cumulative data from sequential analysis
                cumulative_data: sequentialResponse.results?.cumulative_data || {},
                analysis_summary: sequentialResponse.results?.analysis_summary || {},
                // Add default data for VisualizationCanvas compatibility
                nodal_displacements: [],
                element_results: [],
                nodal_stress_strain: [],
                summary: {
                    method: "Sequential Analysis"
                },
                pwp_history: []
            });
            
            setIsAnalyzing(false);
            console.log('✅ Sequential Analysis completed successfully!');
            console.log('📊 All stage results:', stageResults);
            
            // Debug: Check displacement data in each stage
            stageResults.forEach((stage: any, index: number) => {
                console.log(`🔍 Stage ${index} (${stage.stage_name}) summary:`, stage.results?.summary);
                console.log(`🔍 Stage ${index} max_displacement:`, stage.results?.summary?.max_displacement);
                console.log(`🔍 Stage ${index} min_displacement:`, stage.results?.summary?.min_displacement);
                console.log(`🔍 Stage ${index} max_settlement:`, stage.results?.summary?.max_settlement);
            });
            alert(`Sequential Analysis completed successfully!\n\nProcessed ${stages.length} stages:\n${stages.map((s: any) => `• ${s.name}`).join('\n')}`);
            
        } catch (error) {
            setIsAnalyzing(false);
            console.error('❌ Error running sequential analysis:', error);
            alert(`Error running sequential analysis: ${error}`);
        }
    };



  return (
        <AppContext.Provider value={{
            nodeList, addNode, clearNodes,
            elementList, addElement, clearElements, clearMesh,
            boundaryConditionListFullFixed, addBoundaryConditionFullFixed, clearBoundaryConditions,
            boundaryConditionListNormalFixed, addBoundaryConditionNormalFixed, 
            loadList, addLoad,
            pointLoadList, addPointLoad, updatePointLoad, deletePointLoad, clearPointLoads,
            assignNodesToPointLoads,
            setPointLoadList,
            materialList, addMaterial, updateMaterial, deleteMaterial, assignMaterialToPolygon,
            useK0Procedure, setUseK0Procedure,
            waterLevel, setWaterLevel,
            waterLevelList, addWaterLevel, updateWaterLevel, deleteWaterLevel, clearWaterLevels, setWaterLevelList,
            selectedWaterLevelId, setSelectedWaterLevelId,
            interpolationMethod, setInterpolationMethod,
            meshSize, setMeshSize,
            boundaryRefinementFactor, setBoundaryRefinementFactor,
            runFEAnalysis, clearResults, isAnalyzing,
            inputWizard, setInputWizard,
            meshWizard, setMeshWizard,
            stagingWizard, setStagingWizard,
            results, setResultsWizard, resultsWizard,
            polygons, setPolygons,
            selectedPolygonId, setSelectedPolygonId,
            selectedPointLoadId, setSelectedPointLoadId,
            elementMaterials, setElementMaterials,
            showMesh, setShowMesh,
            // General settings
            theme, setTheme,
            snapToGrid, setSnapToGrid,
            gridSize, setGridSize,
            showGrid, setShowGrid,
            showAxis, setShowAxis,
            showAxisLabels, setShowAxisLabels,
            // Stage management
            saveStages, getStages
            }}>
            <div className='h-screen overflow-hidden'>
                <Header />  
                <TabWizard />
                <div className="flex flex-row items-start w-full h-full">
                    {inputWizard && <InputWizard />}
                    {meshWizard && <MeshWizard />}
                    {stagingWizard && <StagingWizard />}
                    {resultsWizard && (
                        <div className="flex flex-row items-start w-full h-full">
                            <div className="w-1/5 p-4 border-r border-gray-200 h-full overflow-y-auto">
                                <button
                                    onClick={runFEAnalysis}
                                    disabled={isAnalyzing}
                                    className={`w-full px-3 py-2 text-sm text-white rounded transition-colors mb-4 ${
                                        isAnalyzing 
                                            ? 'bg-gray-400 cursor-not-allowed' 
                                            : 'bg-blue-500 hover:bg-blue-600'
                                    }`}
                                >
                                    {isAnalyzing ? 'Analyzing...' : 'Run Analysis'}
                                </button>
                                
                                {results && (
                                    <button
                                        onClick={clearResults}
                                        className="w-full px-3 py-2 text-sm bg-red-500 text-white rounded hover:bg-red-600 transition-colors mb-4"
                                    >
                                        Clear Results
                                    </button>
                                )}

                                {/* Stage Results */}
                                {results && results.stages && results.stages.length > 0 && (
                                    <div className="mb-4">
                                        <div className="font-bold mb-2 text-sm text-gray-800">Stage Results</div>
                                        <div className="space-y-2">
                                            {results.stages.map((stage: any, index: number) => (
                                                <button
                                                    key={stage.stage_id || index}
                                                    onClick={() => setSelectedStageIndex(index)}
                                                    className={`w-full text-left p-2 rounded text-xs transition-colors ${
                                                        selectedStageIndex === index
                                                            ? 'bg-blue-500 text-white'
                                                            : 'bg-white text-gray-700 hover:bg-blue-100 border border-gray-200'
                                                    }`}
                                                >
                                                    <div className="font-medium">{stage.stage_name || `Stage ${index + 1}`}</div>
                                                    <div className="text-xs opacity-75">
                                                        Polygons: {stage.activePolygons || 0} | 
                                                        Loads: {stage.activePointLoads || 0} | 
                                                        Water: {stage.activeWaterLevels || 0} | 
                                                        Level: {stage.waterLevel || 0}m
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                            {isAnalyzing ? (
                                <div className="flex items-center justify-center w-4/5 h-full text-gray-400">
                                    <div className="text-center">
                                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
                                        <div>Running FEA Analysis...</div>
                                    </div>
                                </div>
                            ) : results ? (
                                <VisualizationCanvas
                                    nodes={results.stages ? 
                                        nodeList.filter((_, index) => results.stages[selectedStageIndex]?.results.active_nodes?.includes(index)) : 
                                        nodeList}
                                    elements={results.stages ? results.stages[selectedStageIndex]?.results.active_elements || elementList : elementList}
                                    boundaryConditionsFullFixed={results.stages ? 
                                        boundaryConditionListFullFixed.filter(bc => 
                                            results.stages[selectedStageIndex]?.results.active_nodes?.includes(bc.node)
                                        ) : 
                                        boundaryConditionListFullFixed}
                                    boundaryConditionsNormalFixed={results.stages ? 
                                        boundaryConditionListNormalFixed.filter(bc => 
                                            results.stages[selectedStageIndex]?.results.active_nodes?.includes(bc.node)
                                        ) : 
                                        boundaryConditionListNormalFixed}
                                    displacements={results.stages ? results.stages[selectedStageIndex]?.results.nodal_displacements || results.stages[selectedStageIndex]?.results.displacements || [] : results.nodal_displacements || []}
                                    elementResults={results.stages ? results.stages[selectedStageIndex]?.results.element_results || [] : results.element_results || []}
                                    elementMaterials={results.stages ? results.stages[selectedStageIndex]?.results.active_element_materials || elementMaterials : elementMaterials}
                                    nodalStressStrain={results.stages ? results.stages[selectedStageIndex]?.results.nodal_stress_strain || results.stages[selectedStageIndex]?.results.soil_results || [] : results.nodal_stress_strain || []}
                                    summary={{
                                        max_displacement: results.stages ? results.stages[selectedStageIndex]?.results.summary?.max_displacement || 0 : results.summary?.max_displacement || 0,
                                        min_displacement: results.stages ? results.stages[selectedStageIndex]?.results.summary?.min_displacement || 0 : results.summary?.min_displacement || 0,
                                        max_settlement: results.stages ? results.stages[selectedStageIndex]?.results.summary?.max_settlement || 0 : results.summary?.max_settlement || 0,
                                        min_safety_factor: results.stages ? results.stages[selectedStageIndex]?.results.summary?.min_safety_factor || 0 : results.summary?.min_safety_factor || 0,
                                        max_effective_principal_stress_1: results.stages ? results.stages[selectedStageIndex]?.results.summary?.max_effective_principal_stress_1 || 0 : results.summary?.max_effective_principal_stress_1 || 0,
                                        max_pore_water_pressure: results.stages ? results.stages[selectedStageIndex]?.results.summary?.max_pore_water_pressure || 0 : results.summary?.max_pore_water_pressure || 0,
                                        min_pore_water_pressure: results.stages ? results.stages[selectedStageIndex]?.results.summary?.min_pore_water_pressure || 0 : results.summary?.min_pore_water_pressure || 0,
                                        method: results.stages ? "Sequential Analysis" : (results.summary?.method || "FEA Method"),
                                        pwp_history: results.stages ? results.stages[selectedStageIndex]?.results.pwp_history || [] : results.pwp_history || []
                                    }}
                                    useK0Procedure={results.stages ? results.stages[selectedStageIndex]?.results.use_k0_procedure || false : useK0Procedure}
                                    stageResults={results.stages}
                                    selectedStageIndex={selectedStageIndex}
                                    onStageSelect={setSelectedStageIndex}
                                    // ✅ NEW: Plastic analysis data
                                    plasticAnalysis={results.stages ? results.stages[selectedStageIndex]?.results.plastic_analysis || null : results.plastic_analysis || null}
                                    // ✅ NEW: K0 yield check data
                                    k0YieldCheck={results.stages ? results.stages[selectedStageIndex]?.results.yield_check_results || null : results.yield_check_results || null}
                                />
                            ) : (
                                <div className="flex items-center justify-center w-4/5 h-full text-gray-400">
                                    Run analysis to see results...
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="absolute bottom-0 right-0 p-4 bg-gray-50 text-gray-500 text-[10px] w-[15%] text-center">
                    <p>
                        Copyright © 2025 Dahar Engineer. All rights reserved.
                    </p>
                    <p>
                        <a href="https://daharengineer.com" target="_blank" rel="noopener noreferrer">
                            www.daharengineer.com
                        </a>
                    </p>
                </div>
      </div>
        </AppContext.Provider>
  )
}

export default App
