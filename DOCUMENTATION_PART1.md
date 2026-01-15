# TERRA SIM - DOKUMENTASI LENGKAP DATA DAN ALUR APLIKASI (BAGIAN 1)

## DAFTAR ISI
1. [Pendahuluan](#pendahuluan)
2. [Alur Aplikasi Secara Keseluruhan](#alur-aplikasi-secara-keseluruhan)
3. [Data Struktur Frontend](#data-struktur-frontend)

---

## PENDAHULUAN

TerraSim adalah aplikasi analisis geoteknik yang menggunakan metode Finite Element Analysis (FEA) dan K0 procedure untuk analisis tanah. Aplikasi terdiri dari frontend React TypeScript dan backend Python FastAPI.

**Teknologi yang Digunakan:**
- **Frontend**: React + TypeScript + Vite + Tailwind CSS
- **Backend**: Python + FastAPI + NumPy + SciPy
- **Visualisasi**: Plotly.js
- **State Management**: React Context + localStorage

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

### 8. Boundary Conditions Data Structure
**File**: `frontend/src/App.tsx` (line 23-31)

```typescript
interface BoundaryConditionFullFixed {
    node: number;       // Node ID for full fixed BC
}

interface BoundaryConditionNormalFixed {
    node: number;       // Node ID for normal fixed BC
}
```

**Sumber Data**: 
- Generated automatically from mesh
- Stored in `boundaryConditionListFullFixed` and `boundaryConditionListNormalFixed` states

**Contoh Data**:
```json
{
    "node": 1
}
```

### 9. Load Data Structure
**File**: `frontend/src/App.tsx` (line 33)

```typescript
interface Load {
    node: number;       // Node ID
    fx: number;         // Horizontal force (kN)
    fy: number;         // Vertical force (kN)
}
```

**Sumber Data**: 
- Converted from point loads
- Stored in `loadList` state

**Contoh Data**:
```json
{
    "node": 45,
    "fx": 0.0,
    "fy": -150.0
}
```

### 10. Element Material Mapping Data Structure
**File**: `frontend/src/App.tsx` (line 83-95)

```typescript
interface ElementMaterial {
    element_id: number;  // Element ID
    material: Material;  // Material properties
}
```

**Sumber Data**: 
- Generated from material assignment to polygons
- Stored in `elementMaterials` state

**Contoh Data**:
```json
{
    "element_id": 1,
    "material": {
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
}
```

### 11. Analysis Results Data Structure
**File**: `frontend/src/component/VisualizationCanvas.tsx` (line 15-50)

```typescript
interface Displacement {
    node_id: number;    // Node ID
    u: number;          // Horizontal displacement (m)
    v: number;          // Vertical displacement (m)
    magnitude: number;  // Total displacement magnitude (m)
}

interface ElementResult {
    element_id: number;              // Element ID
    node_ids: number[];              // Element node IDs
    strains: number[];               // Strains [εx, εy, γxy]
    stresses: number[];              // Stresses [σx, σy, τxy]
    principal_stresses: number[];    // Principal stresses [σ₁, σ₃]
    total_stress_x: number;          // Total stress σx (kPa)
    total_stress_y: number;          // Total stress σy (kPa)
    effective_stress_x: number;      // Effective stress σ'x (kPa)
    effective_stress_y: number;      // Effective stress σ'y (kPa)
    effective_principal_stress_1: number; // Effective principal stress σ'₁ (kPa)
    effective_principal_stress_3: number; // Effective principal stress σ'₃ (kPa)
    pore_water_pressure: number;     // Pore water pressure (kPa)
    displacements: number[];         // Element nodal displacements
}
```

**Sumber Data**: 
- Received from backend FEA analysis
- Stored in `results` state

**Contoh Data**:
```json
{
    "node_id": 0,
    "u": 0.0,
    "v": 0.0,
    "magnitude": 0.0
}
```

```json
{
    "element_id": 1,
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

---

## KESIMPULAN BAGIAN 1

Bagian 1 ini mencakup semua data struktur yang digunakan di frontend aplikasi TerraSim. Setiap data memiliki definisi yang jelas, sumber data yang spesifik, dan contoh data yang dapat digunakan sebagai referensi.

Data frontend mengalir dari input user melalui berbagai komponen React, disimpan dalam state management, dan dikirim ke backend untuk analisis. Setelah analisis selesai, hasil dikirim kembali ke frontend untuk visualisasi.

Lanjut ke bagian 2 untuk data struktur backend dan API endpoints.
