# TERRA SIM - DOKUMENTASI LENGKAP DATA DAN ALUR APLIKASI (BAGIAN 3)

## DAFTAR ISI
1. [Komponen Frontend](#komponen-frontend)
2. [Alur Integrasi Frontend-Backend](#alur-integrasi-frontend-backend)
3. [State Management](#state-management)
4. [Data Persistence](#data-persistence)

---

## KOMPONEN FRONTEND

### 1. InputWizard Component
**File**: `frontend/src/component/inputwizard.tsx` (line 1-50)

**Fungsi**: Komponen utama untuk input geometri dan parameter analisis

**Props**:
```typescript
interface InputWizardProps {
    polygons: Polygon[];
    setPolygons: (polygons: Polygon[]) => void;
    pointLoads: PointLoad[];
    setPointLoads: (loads: PointLoad[]) => void;
    waterLevels: WaterLevel[];
    setWaterLevels: (levels: WaterLevel[]) => void;
    materials: Material[];
    setMaterials: (materials: Material[]) => void;
}
```

**State Management**:
- `currentStep`: Step wizard saat ini
- `activeTool`: Tool yang sedang aktif (polygon, load, water)
- `drawingMode`: Mode drawing (draw, edit, delete)

**Data Flow**:
1. User input → InputCanvas
2. InputCanvas → PolygonContext
3. PolygonContext → App.tsx state
4. State → localStorage persistence

### 2. InputCanvas Component
**File**: `frontend/src/component/input panel/InputCanvas.tsx` (line 1-100)

**Fungsi**: Canvas untuk drawing geometri dan input data

**Props**:
```typescript
interface InputCanvasProps {
    polygons: Polygon[];
    setPolygons: (polygons: Polygon[]) => void;
    pointLoads: PointLoad[];
    setPointLoads: (loads: PointLoad[]) => void;
    waterLevels: WaterLevel[];
    setWaterLevels: (levels: WaterLevel[]) => void;
    activeTool: string;
    drawingMode: string;
}
```

**State Management**:
- `mousePosition`: Posisi mouse saat ini
- `selectedPolygon`: Polygon yang dipilih
- `isDrawing`: Status sedang drawing
- `tempPoints`: Temporary points saat drawing

**Data Flow**:
1. Mouse events → Drawing logic
2. Drawing logic → Polygon/PointLoad/WaterLevel creation
3. Creation → State update
4. State update → Canvas re-render

### 3. MaterialPanel Component
**File**: `frontend/src/component/MaterialPanel.tsx` (line 1-80)

**Fungsi**: Panel untuk input dan edit material properties

**Props**:
```typescript
interface MaterialPanelProps {
    materials: Material[];
    setMaterials: (materials: Material[]) => void;
    selectedMaterial: Material | null;
    setSelectedMaterial: (material: Material | null) => void;
}
```

**State Management**:
- `editingMaterial`: Material yang sedang diedit
- `showForm`: Status form visibility
- `formData`: Data form material

**Data Flow**:
1. User input → Form validation
2. Form validation → Material creation/update
3. Material update → State update
4. State update → localStorage persistence

### 4. AssignMaterialPanel Component
**File**: `frontend/src/component/AssignMaterialPanel.tsx` (line 1-60)

**Fungsi**: Panel untuk assign material ke polygon

**Props**:
```typescript
interface AssignMaterialPanelProps {
    polygons: Polygon[];
    setPolygons: (polygons: Polygon[]) => void;
    materials: Material[];
    elementMaterials: ElementMaterial[];
    setElementMaterials: (materials: ElementMaterial[]) => void;
}
```

**State Management**:
- `selectedPolygon`: Polygon yang dipilih
- `selectedMaterial`: Material yang dipilih

**Data Flow**:
1. Polygon selection → Material assignment
2. Material assignment → Element-material mapping
3. Mapping update → State update

### 5. StagingWizard Component
**File**: `frontend/src/component/StagingWizard.tsx` (line 1-100)

**Fungsi**: Wizard untuk konfigurasi tahapan analisis

**Props**:
```typescript
interface StagingWizardProps {
    stages: Stage[];
    setStages: (stages: Stage[]) => void;
    polygons: Polygon[];
    pointLoads: PointLoad[];
    waterLevels: WaterLevel[];
}
```

**State Management**:
- `currentStage`: Stage yang sedang diedit
- `showForm`: Status form visibility
- `formData`: Data form stage

**Data Flow**:
1. User input → Stage creation/update
2. Stage update → State update
3. State update → localStorage persistence

### 6. MeshWizard Component
**File**: `frontend/src/component/MeshWizard.tsx` (line 1-80)

**Fungsi**: Wizard untuk generate mesh dan preview

**Props**:
```typescript
interface MeshWizardProps {
    polygons: Polygon[];
    pointLoads: PointLoad[];
    waterLevels: WaterLevel[];
    setNodes: (nodes: Node[]) => void;
    setElements: (elements: Element[]) => void;
    setBoundaryConditions: (bc: any) => void;
    setLoads: (loads: Load[]) => void;
}
```

**State Management**:
- `meshData`: Data mesh yang di-generate
- `isGenerating`: Status mesh generation
- `previewMode`: Mode preview mesh

**Data Flow**:
1. Generate mesh → API call to backend
2. API response → Mesh data update
3. Mesh data → State update
4. State update → Mesh preview

### 7. VisualizationCanvas Component
**File**: `frontend/src/component/VisualizationCanvas.tsx` (line 1-150)

**Fungsi**: Canvas untuk visualisasi hasil analisis

**Props**:
```typescript
interface VisualizationCanvasProps {
    nodes: Node[];
    elements: Element[];
    results: {
        displacements: Displacement[];
        element_results: ElementResult[];
    } | null;
    visualizationType: string;
    colorScale: string;
}
```

**State Management**:
- `plotData`: Data untuk plotting
- `layout`: Layout plot configuration
- `selectedElement`: Element yang dipilih

**Data Flow**:
1. Analysis results → Data processing
2. Data processing → Plotly.js plotting
3. Plotting → Canvas rendering

---

## ALUR INTEGRASI FRONTEND-BACKEND

### 1. Mesh Generation Flow
**File**: `frontend/src/component/MeshWizard.tsx` (line 40-80)

```typescript
const generateMesh = async () => {
    // 1. Prepare data for API
    const meshData = {
        polygons: polygons,
        point_loads: pointLoads,
        water_levels: waterLevels
    };
    
    // 2. Call backend API
    const response = await fetch('/api/generate-mesh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(meshData)
    });
    
    // 3. Process response
    const result = await response.json();
    
    // 4. Update frontend state
    setNodes(result.nodes);
    setElements(result.elements);
    setBoundaryConditions(result.boundary_conditions);
    setLoads(result.loads);
};
```

**Data Flow**:
1. Frontend: Prepare polygon, load, water level data
2. API: POST to `/generate-mesh`
3. Backend: Process mesh generation
4. Response: Return nodes, elements, boundary conditions
5. Frontend: Update state with mesh data

### 2. FEA Analysis Flow
**File**: `frontend/src/App.tsx` (line 200-250)

```typescript
const runFEA = async () => {
    // 1. Prepare analysis data
    const analysisData = {
        nodes: nodeList,
        elements: elementList,
        materials: materialList,
        element_materials: elementMaterials,
        boundary_conditions: {
            full_fixed: boundaryConditionListFullFixed.map(bc => bc.node),
            normal_fixed: boundaryConditionListNormalFixed.map(bc => bc.node)
        },
        loads: loadList,
        water_levels: waterLevelList
    };
    
    // 2. Call backend API
    const response = await fetch('/api/run-fea', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(analysisData)
    });
    
    // 3. Process results
    const result = await response.json();
    
    // 4. Update results state
    setResults(result);
};
```

**Data Flow**:
1. Frontend: Prepare mesh, material, load data
2. API: POST to `/run-fea`
3. Backend: Run FEA analysis
4. Response: Return displacements, stresses, strains
5. Frontend: Update visualization with results

### 3. K0 Analysis Flow
**File**: `frontend/src/App.tsx` (line 250-300)

```typescript
const runK0 = async () => {
    // 1. Prepare K0 data
    const k0Data = {
        materials: materialList,
        element_materials: elementMaterials,
        water_levels: waterLevelList,
        nodes: nodeList,
        elements: elementList
    };
    
    // 2. Call backend API
    const response = await fetch('/api/run-k0', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(k0Data)
    });
    
    // 3. Process results
    const result = await response.json();
    
    // 4. Update K0 results
    setK0Results(result);
};
```

**Data Flow**:
1. Frontend: Prepare material, water level data
2. API: POST to `/run-k0`
3. Backend: Calculate K0 values and initial stresses
4. Response: Return K0 results
5. Frontend: Display K0 analysis results

### 4. Sequential Analysis Flow
**File**: `frontend/src/App.tsx` (line 300-350)

```typescript
const runSequential = async () => {
    // 1. Prepare sequential data
    const sequentialData = {
        stages: stages,
        nodes: nodeList,
        elements: elementList,
        materials: materialList,
        element_materials: elementMaterials,
        boundary_conditions: {
            full_fixed: boundaryConditionListFullFixed.map(bc => bc.node),
            normal_fixed: boundaryConditionListNormalFixed.map(bc => bc.node)
        },
        loads: loadList,
        water_levels: waterLevelList
    };
    
    // 2. Call backend API
    const response = await fetch('/api/run-sequential', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sequentialData)
    });
    
    // 3. Process results
    const result = await response.json();
    
    // 4. Update sequential results
    setSequentialResults(result);
};
```

**Data Flow**:
1. Frontend: Prepare stage definitions and analysis data
2. API: POST to `/run-sequential`
3. Backend: Run sequential analysis for each stage
4. Response: Return results for each stage
5. Frontend: Display stage-by-stage results

---

## STATE MANAGEMENT

### 1. App.tsx Main State
**File**: `frontend/src/App.tsx` (line 100-200)

```typescript
// Core data states
const [polygons, setPolygons] = useState<Polygon[]>([]);
const [materialList, setMaterialList] = useState<Material[]>([]);
const [pointLoadList, setPointLoadList] = useState<PointLoad[]>([]);
const [waterLevelList, setWaterLevelList] = useState<WaterLevel[]>([]);

// Mesh states
const [nodeList, setNodeList] = useState<Node[]>([]);
const [elementList, setElementList] = useState<Element[]>([]);
const [boundaryConditionListFullFixed, setBoundaryConditionListFullFixed] = useState<BoundaryConditionFullFixed[]>([]);
const [boundaryConditionListNormalFixed, setBoundaryConditionListNormalFixed] = useState<BoundaryConditionNormalFixed[]>([]);
const [loadList, setLoadList] = useState<Load[]>([]);

// Analysis states
const [elementMaterials, setElementMaterials] = useState<ElementMaterial[]>([]);
const [results, setResults] = useState<any>(null);
const [k0Results, setK0Results] = useState<any>(null);
const [sequentialResults, setSequentialResults] = useState<any>(null);

// UI states
const [currentStep, setCurrentStep] = useState(1);
const [activeTool, setActiveTool] = useState('polygon');
const [drawingMode, setDrawingMode] = useState('draw');
```

**Data Flow**:
1. User input → State update
2. State update → Component re-render
3. State update → localStorage persistence
4. State update → API calls

### 2. PolygonContext State
**File**: `frontend/src/context/PolygonContext.tsx` (line 1-50)

```typescript
interface PolygonContextType {
    polygons: Polygon[];
    setPolygons: (polygons: Polygon[]) => void;
    selectedPolygon: Polygon | null;
    setSelectedPolygon: (polygon: Polygon | null) => void;
    addPolygon: (polygon: Polygon) => void;
    updatePolygon: (id: string, polygon: Polygon) => void;
    deletePolygon: (id: string) => void;
}
```

**Data Flow**:
1. Context provider → Child components
2. Child components → Context updates
3. Context updates → State synchronization

### 3. Local Storage Hooks
**File**: `frontend/src/hooks/useLocalStorage.ts` (line 1-30)

```typescript
function useLocalStorage<T>(key: string, initialValue: T) {
    const [storedValue, setStoredValue] = useState<T>(() => {
        try {
            const item = window.localStorage.getItem(key);
            return item ? JSON.parse(item) : initialValue;
        } catch (error) {
            return initialValue;
        }
    });

    const setValue = (value: T | ((val: T) => T)) => {
        try {
            const valueToStore = value instanceof Function ? value(storedValue) : value;
            setStoredValue(valueToStore);
            window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
            console.log(error);
        }
    };

    return [storedValue, setValue] as const;
}
```

**Data Flow**:
1. State change → Local storage update
2. App load → Local storage read
3. Local storage → State initialization

---

## DATA PERSISTENCE

### 1. Local Storage Keys
**File**: `frontend/src/App.tsx` (line 150-200)

```typescript
// Local storage keys
const STORAGE_KEYS = {
    POLYGONS: 'polygons',
    MATERIALS: 'materials',
    POINT_LOADS: 'pointLoads',
    WATER_LEVELS: 'waterLevels',
    STAGES: 'stages',
    NODES: 'nodes',
    ELEMENTS: 'elements',
    BOUNDARY_CONDITIONS: 'boundaryConditions',
    LOADS: 'loads',
    ELEMENT_MATERIALS: 'elementMaterials',
    RESULTS: 'results',
    K0_RESULTS: 'k0Results',
    SEQUENTIAL_RESULTS: 'sequentialResults'
};
```

**Data Flow**:
1. State update → Local storage write
2. App initialization → Local storage read
3. Data persistence → User session continuity

### 2. Data Export/Import
**File**: `frontend/src/App.tsx` (line 400-450)

```typescript
const exportData = () => {
    const exportData = {
        polygons,
        materials: materialList,
        pointLoads: pointLoadList,
        waterLevels: waterLevelList,
        stages,
        nodes: nodeList,
        elements: elementList,
        boundaryConditions: {
            fullFixed: boundaryConditionListFullFixed,
            normalFixed: boundaryConditionListNormalFixed
        },
        loads: loadList,
        elementMaterials,
        results,
        k0Results,
        sequentialResults
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = 'terrasim-project.json';
    link.click();
};

const importData = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target?.result as string);
            setPolygons(data.polygons || []);
            setMaterialList(data.materials || []);
            setPointLoadList(data.pointLoads || []);
            setWaterLevelList(data.waterLevels || []);
            setStages(data.stages || []);
            setNodeList(data.nodes || []);
            setElementList(data.elements || []);
            setBoundaryConditionListFullFixed(data.boundaryConditions?.fullFixed || []);
            setBoundaryConditionListNormalFixed(data.boundaryConditions?.normalFixed || []);
            setLoadList(data.loads || []);
            setElementMaterials(data.elementMaterials || []);
            setResults(data.results || null);
            setK0Results(data.k0Results || null);
            setSequentialResults(data.sequentialResults || null);
        } catch (error) {
            console.error('Error importing data:', error);
        }
    };
    reader.readAsText(file);
};
```

**Data Flow**:
1. Export: State → JSON → File download
2. Import: File → JSON → State update
3. Data portability → Project sharing

---

## KESIMPULAN BAGIAN 3

Bagian 3 ini mencakup semua komponen frontend dan alur integrasi dengan backend. Frontend menggunakan React dengan TypeScript untuk UI components dan state management.

Data mengalir dari user input melalui berbagai komponen React, disimpan dalam state management dan localStorage, dan dikirim ke backend melalui API calls. Hasil analisis dikirim kembali ke frontend untuk visualisasi menggunakan Plotly.js.

Integrasi frontend-backend menggunakan REST API dengan JSON data format, memastikan konsistensi data antara kedua layer aplikasi.

Dokumentasi lengkap ini memberikan gambaran komprehensif tentang struktur data, alur aplikasi, dan integrasi komponen dalam aplikasi TerraSim.
