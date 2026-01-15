# TERRA SIM - DOKUMENTASI LENGKAP DATA DAN ALUR APLIKASI

## DAFTAR ISI
1. [Pendahuluan](#pendahuluan)
2. [Alur Aplikasi Secara Keseluruhan](#alur-aplikasi-secara-keseluruhan)
3. [Data Struktur Frontend](#data-struktur-frontend)
4. [Data Struktur Backend](#data-struktur-backend)
5. [API Endpoints dan Data Flow](#api-endpoints-dan-data-flow)
6. [Contoh Data Lengkap](#contoh-data-lengkap)

---

## PENDAHULUAN

TerraSim adalah aplikasi analisis geoteknik yang menggunakan metode Finite Element Analysis (FEA) dan K0 procedure untuk analisis tanah. Aplikasi terdiri dari frontend React TypeScript dan backend Python FastAPI.

---

## ALUR APLIKASI SECARA KESELURUHAN

### 1. Input Wizard (Frontend)
- **File**: `frontend/src/component/inputwizard.tsx`
- **Fungsi**: Input geometri, material, dan beban
- **Output**: Data polygon, material, point load, water level

### 2. Mesh Generation (Backend)
- **File**: `backend/mesh_generator.py`
- **Input**: Polygon vertices, mesh parameters
- **Output**: Nodes, elements, boundary conditions

### 3. Material Assignment (Frontend)
- **File**: `frontend/src/component/MaterialPanel.tsx`
- **Fungsi**: Assign material ke polygon
- **Output**: Element-material mapping

### 4. Stage Configuration (Frontend)
- **File**: `frontend/src/component/StagingWizard.tsx`
- **Fungsi**: Konfigurasi tahapan analisis
- **Output**: Stage definitions

### 5. FEA Analysis (Backend)
- **File**: `backend/fea_solver.py`, `backend/k0_solver.py`
- **Input**: Mesh, materials, loads, boundary conditions
- **Output**: Displacements, stresses, strains

### 6. Visualization (Frontend)
- **File**: `frontend/src/component/VisualizationCanvas.tsx`
- **Fungsi**: Visualisasi hasil analisis
- **Input**: Analysis results
- **Output**: Contour plots, deformed mesh

---

## DATA STRUKTUR FRONTEND

### 1. Node Data Structure
**File**: `frontend/src/App.tsx` (line 8-12)

```typescript
interface Node {
    id: number;        // Node ID (1-based)
    x: number;         // X coordinate (meters)
    y: number;         // Y coordinate (meters)
}
```

**Sumber Data**: 
- Input manual di InputCanvas
- Generated dari mesh generation
- Stored in `nodeList` state

**Contoh Data**:
```json
{
    "id": 1,
    "x": 0.0,
    "y": 0.0
}
```

### 2. Element Data Structure
**File**: `frontend/src/App.tsx` (line 14-21)

```typescript
interface Element {
    id: number;        // Element ID (1-based)
    node1: number;     // First node ID
    node2: number;     // Second node ID
    node3: number;     // Third node ID
    active?: boolean;  // Element active status for sequential analysis
}
```

**Sumber Data**: 
- Generated dari mesh generation
- Stored in `elementList` state

**Contoh Data**:
```json
{
    "id": 1,
    "node1": 1,
    "node2": 2,
    "node3": 10,
    "active": true
}
```

### 3. Material Data Structure
**File**: `frontend/src/App.tsx` (line 40-55)

```typescript
interface Material {
    id?: string;                    // Material ID
    name: string;                   // Material name
    color: string;                  // Display color
    youngsModulus: number;          // Young's modulus (kN/m²)
    poissonsRatio: number;          // Poisson's ratio
    unitWeightSaturated: number;    // Saturated unit weight (kN/m³)
    unitWeightUnsaturated: number;  // Unsaturated unit weight (kN/m³)
    cohesion: number;               // Cohesion (kN/m²)
    frictionAngle: number;          // Friction angle (degrees)
    dilationAngle: number;          // Dilation angle (degrees)
    thickness: number;              // Thickness (m)
    permeability: number;           // Permeability (m/s)
    voidRatio: number;              // Void ratio
    specificGravity: number;        // Specific gravity
}
```

**Sumber Data**: 
- Input manual di MaterialPanel
- Stored in `materialList` state
- Persisted in localStorage

**Contoh Data**:
```json
{
    "id": "clay_1",
    "name": "Soft Clay",
    "color": "#8B4513",
    "youngsModulus": 30000,
    "poissonsRatio": 0.3,
    "unitWeightSaturated": 22.0,
    "unitWeightUnsaturated": 20.0,
    "cohesion": 50.0,
    "frictionAngle": 25.0,
    "dilationAngle": 0.0,
    "thickness": 1.0,
    "permeability": 1e-8,
    "voidRatio": 0.8,
    "specificGravity": 2.7
}
```

### 4. Point Load Data Structure
**File**: `frontend/src/App.tsx` (line 33-40)

```typescript
interface PointLoad {
    id: string;        // Point load ID
    x: number;         // X coordinate (meters)
    y: number;         // Y coordinate (meters)
    fx: number;        // Horizontal force (kN)
    fy: number;        // Vertical force (kN)
    node?: number;     // Assigned node ID (optional)
}
```

**Sumber Data**: 
- Input manual di InputCanvas
- Stored in `pointLoadList` state
- Persisted in localStorage

**Contoh Data**:
```json
{
    "id": "load_1",
    "x": 2.5,
    "y": 2.5,
    "fx": 0.0,
    "fy": -150.0,
    "node": 45
}
```

### 5. Water Level Data Structure
**File**: `frontend/src/App.tsx` (line 57-63)

```typescript
interface WaterLevel {
    id: string;        // Water level ID
    points: Point[];   // Water level polyline points
    isActive: boolean; // Active status
}

interface Point {
    x: number;         // X coordinate
    y: number;         // Y coordinate (water level elevation)
}
```

**Sumber Data**: 
- Input manual di InputCanvas
- Stored in `waterLevelList` state
- Persisted in localStorage

**Contoh Data**:
```json
{
    "id": "water_1",
    "points": [
        {"x": 0.0, "y": 1.5},
        {"x": 5.0, "y": 1.8},
        {"x": 10.0, "y": 1.2}
    ],
    "isActive": true
}
```

### 6. Polygon Data Structure
**File**: `frontend/src/App.tsx` (line 65-72)

```typescript
interface Polygon {
    vertices: Point[];              // Polygon vertices
    meshSize: number;               // Target mesh size
    boundaryRefinementFactor: number; // Boundary refinement factor
    id?: string;                    // Polygon ID
    materialId?: string;            // Assigned material ID
}
```

**Sumber Data**: 
- Input manual di InputCanvas
- Stored in `polygons` state
- Persisted in localStorage

**Contoh Data**:
```json
{
    "vertices": [
        {"x": 0.0, "y": 0.0},
        {"x": 10.0, "y": 0.0},
        {"x": 10.0, "y": 10.0},
        {"x": 0.0, "y": 10.0}
    ],
    "meshSize": 0.5,
    "boundaryRefinementFactor": 0.3,
    "id": "polygon_1",
    "materialId": "clay_1"
}
```

### 7. Stage Data Structure
**File**: `frontend/src/App.tsx` (line 74-81)

```typescript
interface Stage {
    id: string;                     // Stage ID
    name: string;                   // Stage name
    activePolygons: string[];       // Active polygon IDs
    activePointLoads: string[];     // Active point load IDs
    activeWaterLevels: string[];    // Active water level IDs
    calculationType: 'FEA' | 'K0';  // Analysis type
}
```

**Sumber Data**: 
- Input manual di StagingWizard
- Stored in localStorage as 'stages'

**Contoh Data**:
```json
{
    "id": "initial",
    "name": "Initial Stage",
    "activePolygons": ["polygon_1"],
    "activePointLoads": ["load_1"],
    "activeWaterLevels": ["water_1"],
    "calculationType": "FEA"
}
```

---

## DATA STRUKTUR BACKEND

### 1. Geometry Data Structure
**File**: `backend/input_data.py` (line 48-120)

```python
class Geometry:
    nodes: np.ndarray              # Node coordinates [[x, y], ...]
    elements: np.ndarray           # Element connectivity [[node1, node2, node3], ...]
    num_nodes: int                 # Number of nodes
    num_elements: int              # Number of elements
    element_active: np.ndarray     # Boolean array for active elements
```

**Sumber Data**: 
- Converted from frontend Node/Element data
- Used in FEA and K0 solvers

**Contoh Data**:
```python
{
    "nodes": np.array([[0.0, 0.0], [0.5, 0.0], [1.0, 0.0]]),
    "elements": np.array([[0, 1, 10], [1, 11, 10]]),
    "num_nodes": 49,
    "num_elements": 71,
    "element_active": np.array([True, True, False, ...])
}
```

### 2. Material Properties Data Structure
**File**: `backend/input_data.py` (line 122-135)

```python
class Material:
    young_modulus: float           # Young's modulus (kN/m²)
    poisson_ratio: float           # Poisson's ratio
    unit_weight_saturated: float   # Saturated unit weight (kN/m³)
    unit_weight_unsaturated: float # Unsaturated unit weight (kN/m³)
    cohesion: float                # Cohesion (kN/m²)
    friction_angle: float          # Friction angle (degrees)
    thickness: float               # Thickness (m)
    permeability: float            # Permeability (m/s)
    void_ratio: float              # Void ratio
    specific_gravity: float        # Specific gravity
```

**Sumber Data**: 
- Converted from frontend Material data
- Used in CST element calculations

**Contoh Data**:
```python
{
    "young_modulus": 30000.0,
    "poisson_ratio": 0.3,
    "unit_weight_saturated": 22.0,
    "unit_weight_unsaturated": 20.0,
    "cohesion": 50.0,
    "friction_angle": 25.0,
    "thickness": 1.0,
    "permeability": 1e-8,
    "void_ratio": 0.8,
    "specific_gravity": 2.7
}
```

### 3. Boundary Conditions Data Structure
**File**: `backend/input_data.py` (line 137-170)

```python
class BoundaryConditions:
    fixed_nodes: List[int]         # Fully fixed node IDs
    normal_fixed_nodes: List[int]  # Normal fixed node IDs
    applied_forces: np.ndarray     # Applied forces [[node_id, fx, fy], ...]
    gravity_loads: bool            # Include gravity loads
    water_table: float             # Water table level (m)
    foundation_pressure: float     # Foundation pressure (kN/m²)
```

**Sumber Data**: 
- Generated automatically from mesh
- Can be modified manually

**Contoh Data**:
```python
{
    "fixed_nodes": [0, 1, 2, 3, 4, 5, 6, 7, 8],
    "normal_fixed_nodes": [9, 19, 27, 36, 17, 26, 35, 44, 48],
    "applied_forces": np.array([[45, 0.0, -150.0], [46, 0.0, -150.0]]),
    "gravity_loads": True,
    "water_table": 1.5,
    "foundation_pressure": 200.0
}
```

### 4. CST Element Data Structure
**File**: `backend/cst_element.py` (line 8-50)

```python
class CSTElement:
    nodes: np.ndarray              # Node coordinates
    area: float                    # Element area
    B_matrix: np.ndarray           # Strain-displacement matrix
    D_matrix: np.ndarray           # Material matrix
    centroid: np.ndarray           # Element centroid
    thickness: float               # Element thickness
    unit_weight_saturated: float   # Saturated unit weight
    unit_weight_unsaturated: float # Unsaturated unit weight
    initial_stress: np.ndarray     # Initial stress state
    initial_displacement: np.ndarray # Initial displacement state
    initial_pwp: float             # Initial pore water pressure
    plastic_strain: np.ndarray     # Plastic strain
    is_yielded: bool               # Yield status
```

**Sumber Data**: 
- Created from geometry and material data
- Used in FEA calculations

**Contoh Data**:
```python
{
    "nodes": np.array([[0.0, 0.0], [0.5, 0.0], [0.25, 0.5]]),
    "area": 0.125,
    "B_matrix": np.array([[2.0, 0, -2.0, 0, 0, 0], ...]),
    "D_matrix": np.array([[1.0, 0.3, 0], [0.3, 1.0, 0], [0, 0, 0.35]]),
    "centroid": np.array([0.25, 0.167]),
    "thickness": 1.0,
    "unit_weight_saturated": 22.0,
    "unit_weight_unsaturated": 20.0,
    "initial_stress": np.array([0.0, 0.0, 0.0]),
    "plastic_strain": np.array([0.0, 0.0, 0.0]),
    "is_yielded": False
}
```

### 5. FEA Solver Results Data Structure
**File**: `backend/fea_solver.py` (line 400-500)

```python
class FEASolver:
    global_stiffness: np.ndarray   # Global stiffness matrix
    global_force: np.ndarray       # Global force vector
    displacements: np.ndarray      # Nodal displacements
    elements: List[Dict]           # Element data with results
    stage_results: Dict            # Complete stage results
```

**Sumber Data**: 
- Calculated during FEA analysis
- Contains all analysis results

**Contoh Data**:
```python
{
    "global_stiffness": np.array([[1e15, 0, 0], [0, 1e15, 0], [0, 0, 1e15]]),
    "global_force": np.array([0.0, -150.0, 0.0]),
    "displacements": np.array([0.0, -0.001, 0.0]),
    "elements": [
        {
            "element": CSTElement(...),
            "node_ids": [0, 1, 10],
            "material": {...},
            "element_index": 0
        }
    ],
    "stage_results": {
        "displacements": [...],
        "stress_state": {...},
        "element_results": [...],
        "nodal_results": [...]
    }
}
```

### 6. Sequential History Data Structure
**File**: `backend/sequential_history.py` (line 15-35)

```python
class SequentialHistory:
    stages: Dict                   # Stage data storage
    stress_history: Dict           # Stress tracking per stage
    displacement_history: Dict     # Displacement tracking per stage
    pwp_history: Dict              # PWP tracking per stage
    plastic_strain_history: Dict   # Plastic strain tracking per stage
    yield_check_history: Dict      # Yield check results per stage
    soil_results: Dict             # Soil results per stage
```

**Sumber Data**: 
- Accumulated from multiple stages
- Used for transfer conditions

**Contoh Data**:
```python
{
    "stages": {
        "initial": {
            "stage_id": "initial",
            "stage_name": "Initial Stage",
            "stage_sequence": 1,
            "calculation_type": "FEA",
            "is_initial_stage": True
        }
    },
    "stress_history": {
        "initial": {
            "initial_stress": {"element_stresses": [...]},
            "incremental_stress": {"element_stresses": [...]},
            "cumulative_stress": {"element_stresses": [...]}
        }
    },
    "displacement_history": {
        "initial": {
            "stage_displacement": {"nodal_displacements": [...]},
            "cumulative_displacement": {"nodal_displacements": [...]}
        }
    }
}
```

---

## API ENDPOINTS DAN DATA FLOW

### 1. Mesh Generation API
**Endpoint**: `POST /api/mesh/generate`
**File**: `backend/api.py` (line 200-400)

**Input Data**:
```json
{
    "polygons": [
        {
            "vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 0}],
            "meshSize": 0.5,
            "boundaryRefinementFactor": 0.3,
            "materialId": "clay_1"
        }
    ],
    "materials": [
        {
            "id": "clay_1",
            "name": "Soft Clay",
            "youngsModulus": 30000,
            "poissonsRatio": 0.3,
            "unitWeightSaturated": 22.0,
            "unitWeightUnsaturated": 20.0,
            "cohesion": 50.0,
            "frictionAngle": 25.0,
            "dilationAngle": 0.0,
            "thickness": 1.0,
            "permeability": 1e-8,
            "voidRatio": 0.8,
            "specificGravity": 2.7
        }
    ],
    "pointLoads": [
        {
            "id": "load_1",
            "x": 2.5,
            "y": 2.5,
            "fx": 0.0,
            "fy": -150.0
        }
    ]
}
```

**Output Data**:
```json
{
    "success": true,
    "nodes": [[0.0, 0.0], [0.5, 0.0], [1.0, 0.0]],
    "elements": [[1, 2, 10], [2, 11, 10]],
    "element_materials": [
        {
            "element_id": 1,
            "material": {...}
        }
    ],
    "boundary_conditions": {
        "full_fixed": [{"node": 0}, {"node": 1}],
        "normal_fixed": [{"node": 9}, {"node": 19}]
    },
    "point_load_assignments": [
        {
            "point_load_id": "load_1",
            "assigned_node_id": 45,
            "x": 2.5,
            "y": 2.5,
            "fx": 0.0,
            "fy": -150.0
        }
    ]
}
```

### 2. FEA Analysis API
**Endpoint**: `POST /api/fea/analyze`
**File**: `backend/api.py` (line 150-200)

**Input Data**:
```json
{
    "nodes": [{"id": 1, "x": 0.0, "y": 0.0}],
    "elements": [{"id": 1, "node1": 1, "node2": 2, "node3": 10}],
    "boundaryConditionsFullFixed": [{"node": 1}],
    "boundaryConditionsNormalFixed": [{"node": 9}],
    "loads": [{"node": 45, "fx": 0.0, "fy": -150.0}],
    "pointLoads": [{"id": "load_1", "x": 2.5, "y": 2.5, "fx": 0.0, "fy": -150.0}],
    "materials": [
        {
            "element_id": 1,
            "material": {...}
        }
    ],
    "use_k0_procedure": false,
    "water_level": 1.5,
    "water_level_points": [{"x": 0.0, "y": 1.5}, {"x": 10.0, "y": 1.2}],
    "interpolation_method": "area_weighted",
    "stage_name": "Initial Stage",
    "stage_id": "initial",
    "stage_sequence": 1,
    "is_initial_stage": true,
    "element_active": [true, true, false, ...],
    "previous_stage_active_elements": []
}
```

**Output Data**:
```json
{
    "success": true,
    "message": "FEA analysis completed successfully",
    "results": {
        "displacements": [0.0, -0.001, 0.0, ...],
        "element_results": [
            {
                "element_index": 0,
                "node_ids": [0, 1, 10],
                "strains": [0.0001, -0.0002, 0.00005],
                "stresses": [50.0, -100.0, 25.0],
                "principal_stresses": [75.0, -125.0],
                "total_stress_x": 50.0,
                "total_stress_y": -100.0,
                "effective_stress_x": 45.0,
                "effective_stress_y": -95.0,
                "effective_principal_stress_1": 70.0,
                "effective_principal_stress_3": -120.0,
                "pore_water_pressure": 5.0,
                "displacements": [0.0, 0.0, 0.0, -0.001, 0.0, 0.0]
            }
        ],
        "nodal_displacements": [
            {
                "node_id": 0,
                "u": 0.0,
                "v": 0.0,
                "magnitude": 0.0
            }
        ],
        "nodal_stress_strain": [
            {
                "node_id": 0,
                "effective_stress_x": 45.0,
                "effective_stress_y": -95.0,
                "total_stress_x": 50.0,
                "total_stress_y": -100.0,
                "pore_water_pressure": 5.0,
                "principal_stress_1": 75.0,
                "principal_stress_3": -125.0,
                "effective_principal_stress_1": 70.0,
                "effective_principal_stress_3": -120.0
            }
        ],
        "soil_results": {
            "max_effective_principal_stress_1": 70.0,
            "max_principal_stress": 75.0,
            "max_total_stress_x": 50.0,
            "min_total_stress_x": -25.0,
            "max_total_stress_y": -100.0,
            "min_total_stress_y": -150.0,
            "max_settlement": 0.001,
            "surface_settlements": [0.001, 0.0008, 0.0006],
            "max_pore_water_pressure": 15.0,
            "min_pore_water_pressure": 0.0
        },
        "active_nodes": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        "stage_info": {
            "stage_name": "Initial Stage",
            "stage_id": "initial",
            "stage_sequence": 1,
            "is_initial_stage": true,
            "use_k0_procedure": false,
            "calculation_type": "FEA"
        },
        "summary": {
            "max_displacement": 0.001,
            "min_displacement": 0.0,
            "max_settlement": 0.001,
            "min_safety_factor": 1.5,
            "max_effective_principal_stress_1": 70.0,
            "max_pore_water_pressure": 15.0,
            "min_pore_water_pressure": 0.0,
            "max_total_stress_x": 50.0,
            "min_total_stress_x": -25.0,
            "max_total_stress_y": -100.0,
            "min_total_stress_y": -150.0,
            "stability_assessment": "STABLE",
            "analysis_type": "FEA"
        }
    }
}
```

### 3. Sequential Analysis API
**Endpoint**: `POST /api/sequential/analyze`
**File**: `backend/api.py` (line 600-800)

**Input Data**:
```json
{
    "stages": [
        {
            "stage_id": "initial",
            "stage_name": "Initial Stage",
            "stage_sequence": 1,
            "calculation_type": "FEA",
            "is_initial_stage": true,
            "nodes": [...],
            "elements": [...],
            "boundaryConditionsFullFixed": [...],
            "boundaryConditionsNormalFixed": [...],
            "loads": [...],
            "materials": [...],
            "water_level": 1.5,
            "water_level_points": [...],
            "interpolation_method": "area_weighted",
            "active_polygons": ["polygon_1"],
            "active_point_loads": ["load_1"],
            "active_water_levels": ["water_1"],
            "element_active": [true, true, false, ...],
            "previous_stage_active_elements": []
        }
    ],
    "continue_from_previous": true
}
```

**Output Data**:
```json
{
    "success": true,
    "message": "Sequential analysis completed successfully for 1 stages",
    "results": {
        "stages": [
            {
                "stage_id": "initial",
                "stage_name": "Initial Stage",
                "stage_sequence": 1,
                "calculation_type": "FEA",
                "is_initial_stage": true,
                "results": {...},
                "success": true,
                "activePolygons": 1,
                "activePointLoads": 1,
                "activeWaterLevels": 1,
                "waterLevel": 1.5
            }
        ],
        "cumulative_data": {
            "total_stages": 1,
            "stages": [...]
        },
        "analysis_summary": {
            "total_stages": 1,
            "initial_stage_type": "FEA",
            "final_stage_type": "FEA",
            "analysis_completed": true
        }
    },
    "stage_results": [...]
}
```

---

## CONTOH DATA LENGKAP

### Contoh 1: Material Tanah Lempung Lunak
```json
{
    "id": "soft_clay",
    "name": "Soft Clay",
    "color": "#8B4513",
    "youngsModulus": 30000,
    "poissonsRatio": 0.3,
    "unitWeightSaturated": 22.0,
    "unitWeightUnsaturated": 20.0,
    "cohesion": 50.0,
    "frictionAngle": 25.0,
    "dilationAngle": 0.0,
    "thickness": 1.0,
    "permeability": 1e-8,
    "voidRatio": 0.8,
    "specificGravity": 2.7
}
```

### Contoh 2: Point Load Fondasi
```json
{
    "id": "foundation_load",
    "x": 2.5,
    "y": 2.5,
    "fx": 0.0,
    "fy": -150.0,
    "node": 45
}
```

### Contoh 3: Water Level Polyline
```json
{
    "id": "groundwater",
    "points": [
        {"x": 0.0, "y": 1.5},
        {"x": 5.0, "y": 1.8},
        {"x": 10.0, "y": 1.2}
    ],
    "isActive": true
}
```

### Contoh 4: Element Results dari FEA
```json
{
    "element_index": 0,
    "node_ids": [0, 1, 10],
    "strains": [0.0001, -0.0002, 0.00005],
    "stresses": [50.0, -100.0, 25.0],
    "principal_stresses": [75.0, -125.0],
    "total_stress_x": 50.0,
    "total_stress_y": -100.0,
    "effective_stress_x": 45.0,
    "effective_stress_y": -95.0,
    "effective_principal_stress_1": 70.0,
    "effective_principal_stress_3": -120.0,
    "pore_water_pressure": 5.0,
    "displacements": [0.0, 0.0, 0.0, -0.001, 0.0, 0.0]
}
```

### Contoh 5: Nodal Displacement Results
```json
{
    "node_id": 0,
    "u": 0.0,
    "v": 0.0,
    "magnitude": 0.0
}
```

### Contoh 6: Soil Results Summary
```json
{
    "max_effective_principal_stress_1": 70.0,
    "max_principal_stress": 75.0,
    "max_total_stress_x": 50.0,
    "min_total_stress_x": -25.0,
    "max_total_stress_y": -100.0,
    "min_total_stress_y": -150.0,
    "max_settlement": 0.001,
    "surface_settlements": [0.001, 0.0008, 0.0006],
    "max_pore_water_pressure": 15.0,
    "min_pore_water_pressure": 0.0
}
```

---

## KESIMPULAN

Dokumentasi ini mencakup semua data struktur yang digunakan dalam aplikasi TerraSim, baik di frontend maupun backend. Setiap data memiliki sumber yang jelas dan contoh yang dapat digunakan sebagai referensi untuk pengembangan lebih lanjut.

Data mengalir dari input user di frontend, melalui mesh generation, material assignment, stage configuration, FEA analysis, hingga visualisasi hasil di frontend. Setiap tahap memiliki data struktur yang spesifik dan terdefinisi dengan baik. 