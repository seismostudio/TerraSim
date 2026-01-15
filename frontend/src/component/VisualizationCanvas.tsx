import { useState, useMemo, useCallback } from "react";
import Plot from 'react-plotly.js';

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

interface BoundaryConditionFullFixed {
  node: number;
}

interface BoundaryConditionNormalFixed {
  node: number;
}

interface Displacement {
  node_id: number;
  u: number;
  v: number;
  magnitude: number;
}

interface ElementResult {
  element_id: number;
  node_ids: number[];
  strains: number[];
  stresses: number[];
  principal_stresses: number[];
  total_stress_x: number;
  total_stress_y: number;
  effective_stress_x: number;
  effective_stress_y: number;
  effective_principal_stress_1: number;
  effective_principal_stress_3: number;
  pore_water_pressure: number;
  displacements: number[];
  // ✅ Plastic strain data
  plastic_analysis?: {
    converged: boolean;
    iterations: number;
    final_yield_function: number;
    trial_yield_function: number;
    is_yielding: boolean;
    plastic_strain_increment: number[];
    elastic_strain_increment: number[];
  };
  plastic_strain?: number[];
  accumulated_plastic_strain?: number;
  is_yielded?: boolean;
}

// ✅ Plastic analysis summary interface
interface PlasticAnalysisSummary {
  total_elements: number;
  yielded_elements: number;
  yielded_elements_list: number[];
  total_iterations: number;
  convergence_rate: number;
  converged: boolean;
  max_yield_function_abs: number;
  avg_yield_function_abs: number;
}

// ✅ NEW: K0 yield check interface
interface K0YieldCheckSummary {
  yielded_elements: number[];
  yielded_elements_list: number[];
  yield_function_values: number[];
  max_yield_function: number;
  total_elements: number;
  yielded_elements_count: number;
  has_initial_yielding: boolean;
}

interface ElementMaterial {
  element_id: number;
  material: {
    id?: string;
    name: string;
    color: string;
    youngsModulus: number;
    poissonsRatio: number;
    unitWeight: number;
    cohesion: number;
    frictionAngle: number;
    thickness: number;
    permeability: number;
    voidRatio: number;
    specificGravity: number;
  };
}

interface NodalStressStrain {
  node_id: number;
  effective_stress_x: number;
  effective_stress_y: number;
  total_stress_x: number;
  total_stress_y: number;
  pore_water_pressure: number;
  principal_stress_1?: number;
  principal_stress_3?: number;
  effective_principal_stress_1?: number;
  effective_principal_stress_3?: number;
  // ✅ Plastic strain data
  plastic_strain?: number[];
  // ✅ Yield status
  is_yielded?: boolean;
}

interface StageResult {
  stage_id: string;  // ✅ Changed to match backend format
  stage_name: string;  // ✅ Changed to match backend format
  results: any;
  activePolygons: number;
  activePointLoads: number;
  activeWaterLevels: number;
  waterLevel: number;
}

interface VisualizationCanvasProps {
  nodes: Node[];
  elements: Element[];
  boundaryConditionsFullFixed: BoundaryConditionFullFixed[];
  boundaryConditionsNormalFixed: BoundaryConditionNormalFixed[];
  displacements: Displacement[];
  elementResults: ElementResult[];
  elementMaterials?: ElementMaterial[];
  nodalStressStrain: NodalStressStrain[];
  summary: any;
  useK0Procedure?: boolean;
  // Multi-stage results
  stageResults?: StageResult[];
  selectedStageIndex?: number;
  onStageSelect?: (index: number) => void;
  // ✅ Plastic analysis data
  plasticAnalysis?: PlasticAnalysisSummary;
  // ✅ NEW: K0 yield check data
  k0YieldCheck?: K0YieldCheckSummary;
}



export default function VisualizationCanvas({
  nodes,
  elements,
  boundaryConditionsFullFixed,
  boundaryConditionsNormalFixed,
  displacements,
  elementMaterials,
  nodalStressStrain,
  summary,
  useK0Procedure = false,
  stageResults,
  selectedStageIndex = 0,
  onStageSelect,
  plasticAnalysis,
  k0YieldCheck,  // ✅ NEW: Add K0 yield check parameter
}: VisualizationCanvasProps) {
  const [visualizationMode, setVisualizationMode] = useState<'mesh' | 'contour' | 'deformed' | 'pore_pressure' | 'principal_stress_1' | 'principal_stress_3' | 'effective_stress_1' | 'effective_stress_3' | 'material_verification' | 'yielded_elements'>('contour');
  const [deformScale, setDeformScale] = useState(1);
  const [isComputing] = useState(false);

  // Debug logging for PWP values
  console.log('VisualizationCanvas Summary PWP values:', {
    max_pwp: summary?.max_pore_water_pressure,
    min_pwp: summary?.min_pore_water_pressure,
    summary_keys: Object.keys(summary || {}),
    has_pwp_history: !!summary?.pwp_history
  });
  
  // Debug logging for displacement values
  console.log('VisualizationCanvas Displacement values:', {
    max_displacement: summary?.max_displacement,
    min_displacement: summary?.min_displacement,
    max_settlement: summary?.max_settlement,
    summary_full: summary,
    displacements_length: displacements?.length,
    stageResults_length: stageResults?.length,
    selectedStageIndex: selectedStageIndex
  });

  // OPTIMIZATION: Create spatial index for faster element lookup
  const spatialIndex = useMemo(() => {
    if (!nodes.length || !elements.length) return null;
    
    const bounds = {
      minX: Math.min(...nodes.map(n => n.x)),
      maxX: Math.max(...nodes.map(n => n.x)),
      minY: Math.min(...nodes.map(n => n.y)),
      maxY: Math.max(...nodes.map(n => n.y))
    };
    
    const cellSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) / 20;
    const grid = new Map<string, number[]>();
    
    elements.forEach((element, index) => {
      const n1 = nodes.find(n => n.id === element.node1);
      const n2 = nodes.find(n => n.id === element.node2);
      const n3 = nodes.find(n => n.id === element.node3);
      
      if (n1 && n2 && n3) {
        const minX = Math.min(n1.x, n2.x, n3.x);
        const maxX = Math.max(n1.x, n2.x, n3.x);
        const minY = Math.min(n1.y, n2.y, n3.y);
        const maxY = Math.max(n1.y, n2.y, n3.y);
        
        const startCellX = Math.floor((minX - bounds.minX) / cellSize);
        const endCellX = Math.floor((maxX - bounds.minX) / cellSize);
        const startCellY = Math.floor((minY - bounds.minY) / cellSize);
        const endCellY = Math.floor((maxY - bounds.minY) / cellSize);
        
        for (let cx = startCellX; cx <= endCellX; cx++) {
          for (let cy = startCellY; cy <= endCellY; cy++) {
            const key = `${cx},${cy}`;
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key)!.push(index);
          }
        }
      }
    });
    
    return { grid, cellSize, bounds };
  }, [nodes, elements]);

  // OPTIMIZATION: Pre-compute data lookup maps
  const dataLookup = useMemo(() => {
    const displacementMap = new Map<number, Displacement>();
    const nodalMap = new Map<number, NodalStressStrain>();
    
    displacements.forEach(d => displacementMap.set(d.node_id, d));
    nodalStressStrain.forEach(n => nodalMap.set(n.node_id, n));
    
    return { displacements: displacementMap, nodalStressStrain: nodalMap };
  }, [displacements, nodalStressStrain]);

  // OPTIMIZATION: Simplified polygon boundary extraction
  const polygonBoundary = useMemo(() => {
    if (!nodes.length || !elements.length) return [];
    
    const boundaryEdges = new Set<string>();
    const edgeCount = new Map<string, number>();
    
    elements.forEach(el => {
      const edges = [
        [Math.min(el.node1, el.node2), Math.max(el.node1, el.node2)],
        [Math.min(el.node2, el.node3), Math.max(el.node2, el.node3)],
        [Math.min(el.node3, el.node1), Math.max(el.node3, el.node1)]
      ];
      
      edges.forEach(([n1, n2]) => {
        const edgeKey = `${n1}-${n2}`;
        edgeCount.set(edgeKey, (edgeCount.get(edgeKey) || 0) + 1);
      });
    });
    
    edgeCount.forEach((count, edgeKey) => {
      if (count === 1) boundaryEdges.add(edgeKey);
    });
    
    const boundaryVertices: { x: number; y: number }[] = [];
    const visited = new Set<string>();
    
    const startEdge = Array.from(boundaryEdges)[0];
    if (startEdge) {
      const [startNodeId] = startEdge.split('-').map(Number);
      let currentNodeId = startNodeId;
      
      while (boundaryVertices.length < boundaryEdges.size) {
        const node = nodes.find(n => n.id === currentNodeId);
        if (node) boundaryVertices.push({ x: node.x, y: node.y });
        
        let nextNodeId = null;
        for (const edgeKey of boundaryEdges) {
          if (visited.has(edgeKey)) continue;
          
          const [n1, n2] = edgeKey.split('-').map(Number);
          if (n1 === currentNodeId) {
            nextNodeId = n2;
            visited.add(edgeKey);
            break;
          } else if (n2 === currentNodeId) {
            nextNodeId = n1;
            visited.add(edgeKey);
            break;
          }
        }
        
        if (nextNodeId === null || nextNodeId === startNodeId) break;
        currentNodeId = nextNodeId;
      }
    }
    
    return boundaryVertices;
  }, [nodes, elements]);

  // OPTIMIZATION: Fast point-in-polygon check using ray casting
  const isPointInsidePolygon = useCallback((x: number, y: number): boolean => {
    if (polygonBoundary.length < 3) return false;
    
    let inside = false;
    for (let i = 0, j = polygonBoundary.length - 1; i < polygonBoundary.length; j = i++) {
      const xi = polygonBoundary[i].x;
      const yi = polygonBoundary[i].y;
      const xj = polygonBoundary[j].x;
      const yj = polygonBoundary[j].y;
      
      if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }, [polygonBoundary]);

  // OPTIMIZATION: Fast element lookup using spatial index
  const findContainingElement = useCallback((x: number, y: number) => {
    if (!spatialIndex) return null;
    
    const cellX = Math.floor((x - spatialIndex.bounds.minX) / spatialIndex.cellSize);
    const cellY = Math.floor((y - spatialIndex.bounds.minY) / spatialIndex.cellSize);
    const key = `${cellX},${cellY}`;
    
    const candidateElements = spatialIndex.grid.get(key) || [];
    
    for (const elementIndex of candidateElements) {
      const element = elements[elementIndex];
      const n1 = nodes.find(n => n.id === element.node1);
      const n2 = nodes.find(n => n.id === element.node2);
      const n3 = nodes.find(n => n.id === element.node3);
      
      if (!n1 || !n2 || !n3) continue;
      
      // Fast barycentric coordinate check
        const v0x = n2.x - n1.x;
        const v0y = n2.y - n1.y;
        const v1x = n3.x - n1.x;
        const v1y = n3.y - n1.y;
      const v2x = x - n1.x;
      const v2y = y - n1.y;
      
        const dot00 = v0x * v0x + v0y * v0y;
        const dot01 = v0x * v1x + v0y * v1y;
        const dot11 = v1x * v1x + v1y * v1y;
      const dot02 = v0x * v2x + v0y * v2y;
      const dot12 = v1x * v2x + v1y * v2y;
      
        const invDenom = 1 / (dot00 * dot11 - dot01 * dot01);
      const u = (dot11 * dot02 - dot01 * dot12) * invDenom;
      const v = (dot00 * dot12 - dot01 * dot02) * invDenom;
      
      const tolerance = 1e-10;
      if (u >= -tolerance && v >= -tolerance && (u + v) <= (1 + tolerance)) {
        return { 
          element, 
          u, v, 
          n1, n2, n3,
          N1: 1 - u - v,
          N2: u,
          N3: v
        };
      }
    }
    
    return null;
  }, [spatialIndex, nodes, elements]);

  // OPTIMIZATION: Optimized contour data preparation
  const prepareContourDataOptimized = useCallback((dataType: 'displacement' | 'pore_pressure' | 'principal_stress_1' | 'principal_stress_3' | 'effective_stress_1' | 'effective_stress_3' | 'yielded_elements' = 'displacement') => {
    if (!nodes.length || !elements.length) return [];

    // --- Tambahan: Ambil total_pwp dari props jika ada ---
    let totalPWPMap: Map<number, number> | null = null;
    if (dataType === 'pore_pressure') {
      // Coba ambil dari summary.pwp_history.total_pwp (jika ada)
      let pwpArr = null;
      if (summary?.pwp_history?.total_pwp?.element_pwp) {
        pwpArr = summary.pwp_history.total_pwp.element_pwp;
      } else if (summary?.pwp_history?.total_pwp) {
        pwpArr = summary.pwp_history.total_pwp;
      }
      
      if (Array.isArray(pwpArr)) {
        totalPWPMap = new Map();
        for (const pwp of pwpArr) {
          if (typeof pwp.element_id === 'number' && typeof pwp.total_pwp === 'number') {
            totalPWPMap.set(pwp.element_id, pwp.total_pwp);
          }
        }
        console.log(`Found ${totalPWPMap.size} total PWP values from summary.pwp_history`);
        console.log('Sample PWP data:', Array.from(totalPWPMap.entries()).slice(0, 3));
      } else {
        console.log('No total PWP data found in summary.pwp_history');
        console.log('Available summary keys:', Object.keys(summary || {}));
        console.log('Available pwp_history keys:', Object.keys(summary?.pwp_history || {}));
      }
    }
    
    // Check data availability
    if (dataType === 'displacement' && (!displacements || displacements.length === 0)) {
        console.warn('Displacements not available for visualization');
        return [];
    } else if (dataType !== 'displacement' && (!nodalStressStrain || nodalStressStrain.length === 0)) {
        console.warn('Nodal stress/strain not available for', dataType, 'visualization');
        return [];
      }

    // OPTIMIZATION: Adaptive grid size based on mesh complexity and performance
      const elementCount = elements.length;
    let gridSize = 50; // Default for small meshes
    
    if (elementCount >= 500) gridSize = 100;
    if (elementCount >= 1000) gridSize = 75; // Reduce for very large meshes
    if (elementCount >= 2000) gridSize = 50; // Further reduce for extremely large meshes
    
    // OPTIMIZATION: Use bounds from spatial index if available
    const bounds = spatialIndex?.bounds || {
      minX: Math.min(...nodes.map(n => n.x)),
      maxX: Math.max(...nodes.map(n => n.x)),
      minY: Math.min(...nodes.map(n => n.y)),
      maxY: Math.max(...nodes.map(n => n.y))
    };

    // Create optimized grid
    const xGrid = new Array(gridSize);
    const yGrid = new Array(gridSize);
    const xStep = (bounds.maxX - bounds.minX) / (gridSize - 1);
    const yStep = (bounds.maxY - bounds.minY) / (gridSize - 1);
    
    for (let i = 0; i < gridSize; i++) {
      xGrid[i] = bounds.minX + i * xStep;
      yGrid[i] = bounds.minY + i * yStep;
    }

    // OPTIMIZATION: Pre-allocate zGrid array
    const zGrid: (number | null)[][] = Array(gridSize);
    for (let i = 0; i < gridSize; i++) {
      zGrid[i] = new Array(gridSize);
    }

    // OPTIMIZATION: Batch process grid points
    const batchSize = 1000;
    const totalPoints = gridSize * gridSize;
    
    for (let batchStart = 0; batchStart < totalPoints; batchStart += batchSize) {
      const batchEnd = Math.min(batchStart + batchSize, totalPoints);
      
      for (let idx = batchStart; idx < batchEnd; idx++) {
        const i = Math.floor(idx / gridSize);
        const j = idx % gridSize;
        const x = xGrid[j];
        const y = yGrid[i];
        
        // Fast boundary check
        if (!isPointInsidePolygon(x, y)) {
          zGrid[i][j] = null;
          continue;
        }
        
        // Fast element lookup
        const containingElement = findContainingElement(x, y);
        if (!containingElement) {
          zGrid[i][j] = null;
          continue;
        }
        
        const { N1, N2, N3, element: el } = containingElement;
          
        // OPTIMIZATION: Fast data lookup using pre-computed maps
        let interpolatedValue = null;
            
            if (dataType === 'displacement') {
          const d1 = dataLookup.displacements.get(el.node1 - 1);
          const d2 = dataLookup.displacements.get(el.node2 - 1);
          const d3 = dataLookup.displacements.get(el.node3 - 1);
              
              if (d1 && d2 && d3) {
                const val1 = d1.magnitude || 0;
                const val2 = d2.magnitude || 0;
                const val3 = d3.magnitude || 0;
                
                if (isFinite(val1) && isFinite(val2) && isFinite(val3)) {
                  interpolatedValue = N1 * val1 + N2 * val2 + N3 * val3;
                }
              }
            } else if (dataType === 'pore_pressure' && totalPWPMap) {
        // --- Interpolasi total_pwp dari pwp_history (element-based) ---
        // Karena total_pwp ada di level element, kita perlu interpolasi berdasarkan element yang mengandung titik ini
        const elementId = elements.findIndex(e => e.id === el.id);
        if (elementId !== -1) {
          const totalPWP = totalPWPMap.get(elementId);
          if (typeof totalPWP === 'number' && isFinite(totalPWP)) {
            interpolatedValue = totalPWP;
                }
              }
            } else {
          const nodalData1 = dataLookup.nodalStressStrain.get(el.node1 - 1);
          const nodalData2 = dataLookup.nodalStressStrain.get(el.node2 - 1);
          const nodalData3 = dataLookup.nodalStressStrain.get(el.node3 - 1);
              
              if (nodalData1 && nodalData2 && nodalData3) {
            let val1 = 0, val2 = 0, val3 = 0;
            
                switch (dataType) {
                  case 'principal_stress_1':
                val1 = nodalData1.principal_stress_1 || 0;
                val2 = nodalData2.principal_stress_1 || 0;
                val3 = nodalData3.principal_stress_1 || 0;
                    break;
                  case 'principal_stress_3':
                val1 = nodalData1.principal_stress_3 || 0;
                val2 = nodalData2.principal_stress_3 || 0;
                val3 = nodalData3.principal_stress_3 || 0;
                    break;
                  case 'effective_stress_1':
                val1 = nodalData1.effective_principal_stress_1 || 0;
                val2 = nodalData2.effective_principal_stress_1 || 0;
                val3 = nodalData3.effective_principal_stress_1 || 0;
                    break;
                  case 'effective_stress_3':
                val1 = nodalData1.effective_principal_stress_3 || 0;
                val2 = nodalData2.effective_principal_stress_3 || 0;
                val3 = nodalData3.effective_principal_stress_3 || 0;
                    break;
                  case 'pore_pressure':
                val1 = nodalData1.pore_water_pressure || 0;
                val2 = nodalData2.pore_water_pressure || 0;
                val3 = nodalData3.pore_water_pressure || 0;
                    break;
                              case 'yielded_elements':
              // For yielded elements, we'll show 1 for yielded, 0 for non-yielded
              val1 = nodalData1.is_yielded ? 1 : 0;
              val2 = nodalData2.is_yielded ? 1 : 0;
              val3 = nodalData3.is_yielded ? 1 : 0;
                    break;
                }
            
            if (isFinite(val1) && isFinite(val2) && isFinite(val3)) {
              interpolatedValue = N1 * val1 + N2 * val2 + N3 * val3;
                }
              }
            }
        
        // OPTIMIZATION: Simplified validation
        if (interpolatedValue !== null && isFinite(interpolatedValue)) {
            zGrid[i][j] = interpolatedValue;
          } else {
            zGrid[i][j] = null;
          }
        }
        
              // OPTIMIZATION: Yield control to prevent blocking UI
        if (batchStart % (batchSize * 5) === 0) {
          // Allow other tasks to run
          setTimeout(() => {}, 0);
        }
    }

    // OPTIMIZATION: Simplified post-processing (removed expensive outlier detection)
    const validCount = zGrid.flat().filter(v => v !== null).length;
    console.log(`Contour data: ${validCount} valid values out of ${gridSize * gridSize} total points`);
    
      return [{
        x: xGrid,
        y: yGrid,
        z: zGrid,
        type: 'contour' as const,
        colorscale: getColorScale(dataType),
        name: getContourName(dataType),
        showscale: true,
        hoverinfo: 'x+y+z' as const,
        hovertemplate: `${getContourName(dataType)}: %{z:.4f}<extra></extra>`
      }];
  }, [nodes, elements, displacements, nodalStressStrain, dataLookup, spatialIndex, isPointInsidePolygon, findContainingElement, summary]);

  // Legacy function for compatibility
  const prepareContourData = (dataType: 'displacement' | 'pore_pressure' | 'principal_stress_1' | 'principal_stress_3' | 'effective_stress_1' | 'effective_stress_3' | 'yielded_elements' = 'displacement') => {
    return prepareContourDataOptimized(dataType);
  };

  // Helper function to get color scale for different data types
  const getColorScale = (dataType: string) => {
                    switch (dataType) {
      case 'displacement':
        return 'Viridis';
                      case 'principal_stress_1':
                      case 'principal_stress_3':
        return 'RdBu';
                      case 'effective_stress_1':
                      case 'effective_stress_3':
        return 'RdBu';
                      case 'pore_pressure':
        return 'Blues';
                      case 'yielded_elements':
        return 'RdYlBu';

      default:
        return 'Viridis';
      }
  };

  // Helper function to get contour name for different data types
  const getContourName = (dataType: string) => {
    switch (dataType) {
      case 'displacement':
        return 'Displacement Magnitude';
      case 'principal_stress_1':
        return 'Principal Total Stress 1 (σ₁)';
      case 'principal_stress_3':
        return 'Principal Total Stress 3 (σ₃)';
      case 'effective_stress_1':
        return 'Principal Effective Stress 1 (σ\'₁)';
      case 'effective_stress_3':
        return 'Principal Effective Stress 3 (σ\'₃)';
      case 'pore_pressure':
        return 'Pore Water Pressure';
                      case 'yielded_elements':
        return 'Yielded Elements (1=Yielded, 0=Elastic)';

      default:
        return 'Contour';
    }
  };

  // Helper function to get material color for element
  const getElementMaterialColor = (elementId: number): string => {
    if (!elementMaterials) return '#8B4513'; // Default brown color
    
    const elementMaterial = elementMaterials.find(em => em.element_id === elementId);
    return elementMaterial?.material.color || '#8B4513';
  };

  // Helper function to get material name for element
  const getElementMaterialName = (elementId: number): string => {
    if (!elementMaterials) return 'Unknown Material';
    
    const elementMaterial = elementMaterials.find(em => em.element_id === elementId);
    return elementMaterial?.material.name || 'Unknown Material';
  };

  // OPTIMIZATION: Memoized material verification data preparation
  const prepareMaterialVerificationData = useMemo(() => {
    if (!elementMaterials || !elements.length) return null;

    const materialGroups = new Map<string, any>();
    
    elements.forEach(element => {
      const materialColor = getElementMaterialColor(element.id);
      const materialName = getElementMaterialName(element.id);
      
      if (!materialGroups.has(materialColor)) {
        materialGroups.set(materialColor, {
          x: [] as number[],
          y: [] as number[],
          mode: 'markers' as const,
          type: 'scatter' as const,
          marker: { 
            color: materialColor, 
            size: 5,
            opacity: 0.8,
            line: { color: 'black', width: 1 }
          },
          name: materialName,
          showlegend: true,
          hoverinfo: 'x+y+text' as const,
          text: [] as string[]
        });
      }
      
      const group = materialGroups.get(materialColor)!;
      
      // Get element centroid
      const n1 = nodes.find(n => n.id === element.node1);
      const n2 = nodes.find(n => n.id === element.node2);
      const n3 = nodes.find(n => n.id === element.node3);
      
      if (n1 && n2 && n3) {
        const centroidX = (n1.x + n2.x + n3.x) / 3;
        const centroidY = (n1.y + n2.y + n3.y) / 3;
        
        group.x.push(centroidX);
        group.y.push(centroidY);
        group.text.push(`Element ${element.id}<br>Material: ${materialName}<br>Color: ${materialColor}`);
      }
    });
    
    return Array.from(materialGroups.values());
  }, [elementMaterials, elements, nodes]);

  // ✅ NEW: Memoized yielded elements data preparation (for FEA and K0 plastic analysis)
  const prepareYieldedElementsData = useMemo(() => {
    // Use plasticAnalysis from FEA or K0 yield check
    const analysisData = plasticAnalysis || k0YieldCheck;
    if (!elements.length || !analysisData) return null;

    // Determine if this is K0 or FEA analysis
    const isK0Analysis = k0YieldCheck && !plasticAnalysis;
    const analysisType = isK0Analysis ? 'K0' : 'FEA';
    
    // Get mesh lines (like material verification)
    const meshLines = {
      x: [] as (number | null)[],
      y: [] as (number | null)[],
      mode: 'lines' as const,
      type: 'scatter' as const,
      line: { color: '#bbb', width: 1 },
      name: 'Mesh',
      showlegend: false,
      hoverinfo: 'skip' as const
    };

    const yieldedElements = {
      x: [] as number[],
      y: [] as number[],
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'red', 
        size: 5,
        opacity: 0.9,
        symbol: 'circle',
        line: { color: 'darkred', width: 0 }
      },
      name: `${analysisType} Yielded Elements`,
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    const elasticElements = {
      x: [] as number[],
      y: [] as number[],
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'green', 
        size: 5,
        opacity: 0.6,
        symbol: 'circle',
        line: { color: 'darkgreen', width: 0 }
      },
      name: `${analysisType} Elastic Elements`,
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    // Get yielded elements list from plastic analysis (FEA or K0)
    const yieldedElementsList = analysisData.yielded_elements_list || [];
    
    // Pre-allocate arrays for mesh lines
    const meshX: (number | null)[] = [];
    const meshY: (number | null)[] = [];
    
    elements.forEach(element => {
      // Get element nodes for mesh lines
      const n1 = nodes.find(n => n.id === element.node1);
      const n2 = nodes.find(n => n.id === element.node2);
      const n3 = nodes.find(n => n.id === element.node3);
      
      if (n1 && n2 && n3) {
        // Add mesh lines
        meshX.push(n1.x, n2.x, null);
        meshY.push(n1.y, n2.y, null);
        
        meshX.push(n2.x, n3.x, null);
        meshY.push(n2.y, n3.y, null);
        
        meshX.push(n3.x, n1.x, null);
        meshY.push(n3.y, n1.y, null);
        
        // Get element centroid for markers
        const centroidX = (n1.x + n2.x + n3.x) / 3;
        const centroidY = (n1.y + n2.y + n3.y) / 3;
        
        // Check if element is yielded
        const isYielded = yieldedElementsList.includes(element.id);
        

        
        if (isYielded) {
          yieldedElements.x.push(centroidX);
          yieldedElements.y.push(centroidY);
          yieldedElements.text.push(`Element ${element.id}<br>Status: ${analysisType} YIELDED<br>Red Marker`);
        } else {
          elasticElements.x.push(centroidX);
          elasticElements.y.push(centroidY);
          elasticElements.text.push(`Element ${element.id}<br>Status: ${analysisType} ELASTIC<br>Green Marker`);
        }
      }
    });

    meshLines.x = meshX;
    meshLines.y = meshY;
    
    return [meshLines, yieldedElements, elasticElements];
  }, [elements, nodes, plasticAnalysis, k0YieldCheck]);



  // OPTIMIZATION: Memoized mesh data preparation
  const prepareMeshData = useMemo(() => {
    const meshLines = {
      x: [] as (number | null)[],
      y: [] as (number | null)[],
      mode: 'lines' as const,
      type: 'scatter' as const,
      line: { color: '#bbb', width: 1 },
      name: 'Undeformed Mesh',
      showlegend: false,
      hoverinfo: 'skip' as const
    };

    const fullFixedMarkers = {
      x: [] as number[],
      y: [] as number[],
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'red', 
        size: 8, 
        symbol: 'circle',
        line: { color: 'darkred', width: 1 }
      },
      name: 'Full Fixed (FF)',
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    const normalFixedMarkers = {
      x: [] as number[],
      y: [] as number[],
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'orange', 
        size: 8, 
        symbol: 'circle',
        line: { color: 'darkorange', width: 1 }
      },
      name: 'Normal Fixed (NF)',
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    // OPTIMIZATION: Pre-allocate arrays for better performance
    const meshX: (number | null)[] = [];
    const meshY: (number | null)[] = [];
    
    elements.forEach(el => {
      const n1 = nodes.find(n => n.id === el.node1);
      const n2 = nodes.find(n => n.id === el.node2);
      const n3 = nodes.find(n => n.id === el.node3);

      if (n1 && n2 && n3) {
        meshX.push(n1.x, n2.x, null);
        meshY.push(n1.y, n2.y, null);
        
        meshX.push(n2.x, n3.x, null);
        meshY.push(n2.y, n3.y, null);
        
        meshX.push(n3.x, n1.x, null);
        meshY.push(n3.y, n1.y, null);
      }
    });

    meshLines.x = meshX;
    meshLines.y = meshY;

    // OPTIMIZATION: Pre-allocate boundary condition arrays
    const ffX: number[] = [];
    const ffY: number[] = [];
    const ffText: string[] = [];
    const nfX: number[] = [];
    const nfY: number[] = [];
    const nfText: string[] = [];

    boundaryConditionsFullFixed.forEach(bc => {
      const node = nodes.find(n => n.id === bc.node);
      if (node) {
        ffX.push(node.x);
        ffY.push(node.y);
        ffText.push(`FF Node ${bc.node}`);
      }
    });

    boundaryConditionsNormalFixed.forEach(bc => {
      const node = nodes.find(n => n.id === bc.node);
      if (node) {
        nfX.push(node.x);
        nfY.push(node.y);
        nfText.push(`NF Node ${bc.node}`);
      }
    });

    fullFixedMarkers.x = ffX;
    fullFixedMarkers.y = ffY;
    fullFixedMarkers.text = ffText;
    normalFixedMarkers.x = nfX;
    normalFixedMarkers.y = nfY;
    normalFixedMarkers.text = nfText;

    return [meshLines, fullFixedMarkers, normalFixedMarkers];
  }, [nodes, elements, boundaryConditionsFullFixed, boundaryConditionsNormalFixed]);

  // OPTIMIZATION: Memoized deformed mesh data
  const prepareDeformedMeshData = useMemo(() => {
    if (!displacements || displacements.length === 0) {
      return [];
    }

    const safeDeformScale = Math.max(0.1, Math.min(100, deformScale));

    const deformedLines = {
      x: [] as (number | null)[],
      y: [] as (number | null)[],
      mode: 'lines' as const,
      type: 'scatter' as const,
      line: { color: 'red', width: 2 },
      name: 'Deformed Mesh',
      showlegend: false,
      hoverinfo: 'skip' as const
    };

    const deformedFullFixedMarkers = {
      x: [] as number[],
      y: [] as number[],
      z: 999,
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'red', 
        size: 8, 
        symbol: 'circle',
        line: { color: 'darkred', width: 1 }
      },
      name: 'Deformed FF',
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    const deformedNormalFixedMarkers = {
      x: [] as number[],
      y: [] as number[],
      mode: 'markers' as const,
      type: 'scatter' as const,
      marker: { 
        color: 'orange', 
        size: 8, 
        symbol: 'circle',
        line: { color: 'darkorange', width: 1 }
      },
      name: 'Deformed NF',
      showlegend: true,
      hoverinfo: 'x+y+text' as const,
      text: [] as string[]
    };

    // OPTIMIZATION: Pre-allocate arrays
    const defX: (number | null)[] = [];
    const defY: (number | null)[] = [];
    const defFFX: number[] = [];
    const defFFY: number[] = [];
    const defFFText: string[] = [];
    const defNFX: number[] = [];
    const defNFY: number[] = [];
    const defNFText: string[] = [];

    elements.forEach(el => {
      const n1 = nodes.find(n => n.id === el.node1);
      const n2 = nodes.find(n => n.id === el.node2);
      const n3 = nodes.find(n => n.id === el.node3);

      if (n1 && n2 && n3) {
        const d1 = dataLookup.displacements.get(el.node1 - 1);
        const d2 = dataLookup.displacements.get(el.node2 - 1);
        const d3 = dataLookup.displacements.get(el.node3 - 1);

        if (d1 && d2 && d3) {
          const deformedN1 = {
            x: n1.x + d1.u * safeDeformScale,
            y: n1.y + d1.v * safeDeformScale
          };
          const deformedN2 = {
            x: n2.x + d2.u * safeDeformScale,
            y: n2.y + d2.v * safeDeformScale
          };
          const deformedN3 = {
            x: n3.x + d3.u * safeDeformScale,
            y: n3.y + d3.v * safeDeformScale
          };

          defX.push(deformedN1.x, deformedN2.x, null);
          defY.push(deformedN1.y, deformedN2.y, null);
          
          defX.push(deformedN2.x, deformedN3.x, null);
          defY.push(deformedN2.y, deformedN3.y, null);
          
          defX.push(deformedN3.x, deformedN1.x, null);
          defY.push(deformedN3.y, deformedN1.y, null);
        }
      }
    });

    boundaryConditionsFullFixed.forEach(bc => {
      const node = nodes.find(n => n.id === bc.node);
      const displacement = dataLookup.displacements.get(bc.node - 1);
      if (node) {
        const deformedX = node.x + (displacement?.u || 0) * safeDeformScale;
        const deformedY = node.y + (displacement?.v || 0) * safeDeformScale;
        defFFX.push(deformedX);
        defFFY.push(deformedY);
        defFFText.push(`Deformed FF Node ${bc.node}`);
      }
    });

    boundaryConditionsNormalFixed.forEach(bc => {
      const node = nodes.find(n => n.id === bc.node);
      const displacement = dataLookup.displacements.get(bc.node - 1);
      if (node) {
        const deformedX = node.x + (displacement?.u || 0) * safeDeformScale;
        const deformedY = node.y + (displacement?.v || 0) * safeDeformScale;
        defNFX.push(deformedX);
        defNFY.push(deformedY);
        defNFText.push(`Deformed NF Node ${bc.node}`);
      }
    });

    deformedLines.x = defX;
    deformedLines.y = defY;
    deformedFullFixedMarkers.x = defFFX;
    deformedFullFixedMarkers.y = defFFY;
    deformedFullFixedMarkers.text = defFFText;
    deformedNormalFixedMarkers.x = defNFX;
    deformedNormalFixedMarkers.y = defNFY;
    deformedNormalFixedMarkers.text = defNFText;

    return [deformedLines, deformedFullFixedMarkers, deformedNormalFixedMarkers];
  }, [nodes, elements, displacements, boundaryConditionsFullFixed, boundaryConditionsNormalFixed, deformScale, dataLookup]);

  // OPTIMIZATION: Memoized plot data with lazy loading
  const getPlotData = useCallback(() => {
    switch (visualizationMode) {
      case 'mesh':
        return prepareMeshData;
      case 'contour':
        return prepareContourData('displacement');
      case 'deformed':
        return prepareDeformedMeshData;
      case 'principal_stress_1':
        return prepareContourData('principal_stress_1');
      case 'principal_stress_3':
        return prepareContourData('principal_stress_3');
      case 'effective_stress_1':
        return prepareContourData('effective_stress_1');
      case 'effective_stress_3':
        return prepareContourData('effective_stress_3');
      case 'pore_pressure':
        return prepareContourData('pore_pressure');
              case 'yielded_elements':
          return prepareYieldedElementsData || [];
        
        case 'material_verification':
          return prepareMaterialVerificationData || [];
      default:
        return prepareContourData('displacement');
    }
  }, [visualizationMode, prepareMeshData, prepareDeformedMeshData, prepareContourDataOptimized, prepareMaterialVerificationData, prepareYieldedElementsData]);

  // OPTIMIZATION: Memoized layout
  const layout = useMemo(() => ({
      title: 'Results Visualization',
      width: 800,
      height: 600,
      autosize: true
  }), []);



  return (
    <div className="flex flex-row items-start h-full w-4/5">
      <div className="p-4 bg-white h-full">
        {isComputing && (
          <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
            <div className="text-blue-600">Computing contour data...</div>
          </div>
        )}
        <Plot
          {...{
            data: getPlotData(),
            layout,
            config: {
            displayModeBar: true,
            modeBarButtonsToRemove: ['lasso2d', 'select2d', 'toImage', 'autoScale2d', 'zoom2d', 'zoomIn2d', 'zoomOut2d'],
            displaylogo: false,
            scrollZoom: true,
            responsive: true,
            }
          } as any}
        />
      </div>
      
      <div className="text-sm w-full h-full border-l border-gray-200">
        <div className="font-bold p-3 border-b border-gray-200">Visualization Settings</div>
        
        {/* Visualization Mode */}
        <div className="border-b border-gray-200 p-3">
          <label className="block text-xs font-medium mb-2">Display Mode:</label>
          <div className="grid grid-cols-2 gap-1">
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setVisualizationMode('mesh')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'mesh' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Mesh View
              </button>

              <button
                onClick={() => setVisualizationMode('contour')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'contour' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Displacement Contour
              </button>

              <button
                onClick={() => setVisualizationMode('deformed')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'deformed' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Deformed Mesh
              </button>

              <button
                onClick={() => setVisualizationMode('material_verification')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'material_verification' 
                    ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Material Verification
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <button
                onClick={() => setVisualizationMode('principal_stress_1')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'principal_stress_1' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Principal Total Stress 1 (σ₁)
              </button>

              <button
                onClick={() => setVisualizationMode('principal_stress_3')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'principal_stress_3' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Principal Total Stress 3 (σ₃)
              </button>

              <button
                onClick={() => setVisualizationMode('effective_stress_1')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'effective_stress_1' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Principal Effective Stress 1 (σ'₁)
              </button>

              <button
                onClick={() => setVisualizationMode('effective_stress_3')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'effective_stress_3' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Principal Effective Stress 3 (σ'₃)
              </button>

              <button
                onClick={() => setVisualizationMode('pore_pressure')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'pore_pressure' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Pore Water Pressure
              </button>

              <button
                onClick={() => setVisualizationMode('yielded_elements')}
                className={`px-3 py-1 text-xs rounded transition-colors text-left ${
                  visualizationMode === 'yielded_elements' 
                      ? 'bg-gray-500 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Yielded Elements
              </button>
            </div>
          </div>
        </div>

        {/* Deformation Scale Slider (only for deformed mode) */}
        {visualizationMode === 'deformed' && (
          <div className="p-3 border-b border-gray-200">
            <label className="block text-xs font-medium mb-2">
              Deformation Scale: {deformScale}
            </label>
            <input
              type="range"
              min="1"
              max="500"
              step="1"
              value={deformScale}
              onChange={(e) => setDeformScale(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>1</span>
              <span>500</span>
            </div>
          </div>
        )}

        <div className="p-3">          
          {summary && (
            <div className="mb-4">
              <div className="font-bold mb-2">Deformation Results</div>
              <table className="text-xs space-y-2 w-full">
                <tbody>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Displacement:</td>
                    <td className="text-right w-[100%]">
                      {summary?.max_displacement !== undefined 
                        ? summary.max_displacement.toFixed(6) 
                        : (displacements && displacements.length > 0 
                            ? Math.max(...displacements.map(d => d.magnitude)).toFixed(6) 
                            : '0.000000')} m
                    </td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Min Displacement:</td>
                    <td className="text-right w-[100%]">
                      {summary?.min_displacement !== undefined 
                        ? summary.min_displacement.toFixed(6) 
                        : (displacements && displacements.length > 0 
                            ? Math.min(...displacements.map(d => Math.abs(d.magnitude))).toFixed(6) 
                            : '0.000000')} m
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {nodalStressStrain && nodalStressStrain.length > 0 && (
            <div className="mb-4">
              <div className="font-bold mb-2">Post-Processing Results</div>
              <table className="text-xs space-y-2 w-full">
                <tbody>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Effective Stress (σ'₁) :</td>
                    <td className="text-right w-[100%]">{Math.max(...nodalStressStrain.map(n => n.effective_principal_stress_1 || 0)).toFixed(2)} kN/m²</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Min Effective Stress (σ'₁) :</td>
                    <td className="text-right w-[100%]">{Math.min(...nodalStressStrain.map(n => n.effective_principal_stress_1 || 0)).toFixed(2)} kN/m²</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Total Stress (σ₁) :</td>
                    <td className="text-right w-[100%]">{Math.max(...nodalStressStrain.map(n => n.principal_stress_1 || 0)).toFixed(2)} kN/m²</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Min Total Stress (σ₁) :</td>
                    <td className="text-right w-[100%]">{Math.min(...nodalStressStrain.map(n => n.principal_stress_1 || 0)).toFixed(2)} kN/m²</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Pore Water Pressure (u):</td>
                    <td className="text-right w-[100%]">
                      {summary?.max_pore_water_pressure !== undefined 
                        ? summary.max_pore_water_pressure.toFixed(2) 
                        : (nodalStressStrain.length > 0 ? Math.max(...nodalStressStrain.map(n => n.pore_water_pressure || 0)).toFixed(2) : 'N/A')} kN/m²
                    </td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Min Pore Water Pressure (u) :</td>
                    <td className="text-right w-[100%]">
                      {summary?.min_pore_water_pressure !== undefined 
                        ? summary.min_pore_water_pressure.toFixed(2) 
                        : (nodalStressStrain.length > 0 ? Math.min(...nodalStressStrain.map(n => n.pore_water_pressure || 0)).toFixed(2) : 'N/A')} kN/m²
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
          
          {/* ✅ Plastic Analysis Results */}
          {plasticAnalysis && (
            <div className="mb-4">
              <div className="font-bold mb-2">Plastic Analysis Results</div>
              <table className="text-xs space-y-2 w-full">
                <tbody>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Total Elements:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.total_elements}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Yielded Elements:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.yielded_elements}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Total Iterations:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.total_iterations}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Convergence Rate:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.convergence_rate ? (plasticAnalysis.convergence_rate * 100).toFixed(1) : 'N/A'}%</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Converged:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.converged ? 'Yes' : 'No'}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Yield Function:</td>
                    <td className="text-right w-[100%]">{plasticAnalysis.max_yield_function_abs?.toFixed(6) || 'N/A'}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {/* ✅ NEW: K0 Yield Check Results */}
          {k0YieldCheck && (
            <div className="mb-4">
              <div className="font-bold mb-2">K0 Initial Yield Check</div>
              <table className="text-xs space-y-2 w-full">
                <tbody>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Total Elements:</td>
                    <td className="text-right w-[100%]">{k0YieldCheck.total_elements}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Yielded Elements:</td>
                    <td className="text-right w-[100%]">{k0YieldCheck.yielded_elements_count}</td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Initial Yielding:</td>
                    <td className="text-right w-[100%]">
                      <span className={k0YieldCheck.has_initial_yielding ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
                        {k0YieldCheck.has_initial_yielding ? '⚠️ Yes' : '✅ No'}
                      </span>
                    </td>
                  </tr>
                  <tr className="flex flex-row">
                    <td className="text-left w-[100%]">Max Yield Function:</td>
                    <td className="text-right w-[100%]">{k0YieldCheck.max_yield_function?.toFixed(6) || 'N/A'}</td>
                  </tr>
                  {k0YieldCheck.yielded_elements.length > 0 && (
                    <tr className="flex flex-row">
                      <td className="text-left w-[100%]">Yielded Element IDs:</td>
                      <td className="text-right w-[100%] text-red-600 font-semibold">
                        {k0YieldCheck.yielded_elements.join(', ')}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 