# TERRA SIM - DOKUMENTASI LENGKAP DATA DAN ALUR APLIKASI (RINGKASAN LENGKAP)

## DAFTAR ISI LENGKAP

### Bagian 1: Data Struktur Frontend
- [DOCUMENTATION_PART1.md](./DOCUMENTATION_PART1.md)
  - Pendahuluan dan Alur Aplikasi
  - Data Struktur Frontend (11 struktur data)
  - Contoh data untuk setiap struktur

### Bagian 2: Data Struktur Backend
- [DOCUMENTATION_PART2.md](./DOCUMENTATION_PART2.md)
  - Data Struktur Backend (6 struktur data)
  - API Endpoints (4 endpoints)
  - Alur Data Backend (4 proses)

### Bagian 3: Komponen dan Integrasi
- [DOCUMENTATION_PART3.md](./DOCUMENTATION_PART3.md)
  - Komponen Frontend (7 komponen)
  - Alur Integrasi Frontend-Backend (4 alur)
  - State Management dan Data Persistence

---

## RINGKASAN ALUR APLIKASI TERRA SIM

### 1. Input Phase (Frontend)
```
User Input → InputWizard → InputCanvas → State Management → localStorage
```

**Data yang Dibuat**:
- Polygon vertices dan mesh parameters
- Material properties (13 parameter)
- Point loads (koordinat dan gaya)
- Water levels (polyline points)
- Stage definitions

### 2. Mesh Generation Phase (Backend)
```
Polygon Data → mesh_generator.py → Triangle Library → Nodes/Elements → Boundary Conditions
```

**Data yang Dihasilkan**:
- Nodes (koordinat x,y)
- Elements (node connectivity)
- Boundary conditions (full_fixed, normal_fixed)
- Load mapping (point load ke node)

### 3. Material Assignment Phase (Frontend)
```
Polygon Selection → Material Assignment → Element-Material Mapping
```

**Data yang Dibuat**:
- Element-material mapping
- Material properties per element

### 4. Analysis Phase (Backend)
```
Mesh + Materials + Loads → FEA Solver → Displacements + Stresses + Strains
```

**Analisis yang Tersedia**:
- FEA Analysis (Finite Element Analysis)
- K0 Analysis (Initial stress calculation)
- Sequential Analysis (Multi-stage construction)

### 5. Visualization Phase (Frontend)
```
Analysis Results → Plotly.js → Contour Plots + Deformed Mesh
```

**Visualisasi yang Tersedia**:
- Displacement contours
- Stress contours (total, effective)
- Strain contours
- Principal stress plots
- Deformed mesh overlay

---

## INDEKS LENGKAP STRUKTUR DATA

### Frontend Data Structures (11 struktur)

#### 1. Node
- **File**: `frontend/src/App.tsx` (line 8-12)
- **Atribut**: id, x, y
- **Sumber**: Input manual, mesh generation
- **Contoh**: `{"id": 1, "x": 0.0, "y": 0.0}`

#### 2. Element
- **File**: `frontend/src/App.tsx` (line 14-21)
- **Atribut**: id, node1, node2, node3, active
- **Sumber**: Mesh generation
- **Contoh**: `{"id": 1, "node1": 1, "node2": 2, "node3": 10, "active": true}`

#### 3. Material
- **File**: `frontend/src/App.tsx` (line 40-55)
- **Atribut**: 13 parameter (id, name, color, youngsModulus, poissonsRatio, dll)
- **Sumber**: Input manual di MaterialPanel
- **Contoh**: Material dengan properti geoteknik lengkap

#### 4. PointLoad
- **File**: `frontend/src/App.tsx` (line 33-40)
- **Atribut**: id, x, y, fx, fy, node
- **Sumber**: Input manual di InputCanvas
- **Contoh**: `{"id": "load_1", "x": 2.5, "y": 2.5, "fx": 0.0, "fy": -150.0}`

#### 5. WaterLevel
- **File**: `frontend/src/App.tsx` (line 57-63)
- **Atribut**: id, points[], isActive
- **Sumber**: Input manual di InputCanvas
- **Contoh**: Water level polyline dengan multiple points

#### 6. Polygon
- **File**: `frontend/src/App.tsx` (line 65-72)
- **Atribut**: vertices[], meshSize, boundaryRefinementFactor, id, materialId
- **Sumber**: Input manual di InputCanvas
- **Contoh**: Polygon dengan vertices dan mesh parameters

#### 7. Stage
- **File**: `frontend/src/App.tsx` (line 74-81)
- **Atribut**: id, name, activePolygons[], activePointLoads[], activeWaterLevels[], calculationType
- **Sumber**: Input manual di StagingWizard
- **Contoh**: Stage definition untuk sequential analysis

#### 8. BoundaryCondition
- **File**: `frontend/src/App.tsx` (line 23-31)
- **Atribut**: node (untuk full_fixed dan normal_fixed)
- **Sumber**: Generated automatically dari mesh
- **Contoh**: `{"node": 1}`

#### 9. Load
- **File**: `frontend/src/App.tsx` (line 33)
- **Atribut**: node, fx, fy
- **Sumber**: Converted dari point loads
- **Contoh**: `{"node": 45, "fx": 0.0, "fy": -150.0}`

#### 10. ElementMaterial
- **File**: `frontend/src/App.tsx` (line 83-95)
- **Atribut**: element_id, material
- **Sumber**: Generated dari material assignment ke polygons
- **Contoh**: Mapping element ke material properties

#### 11. Analysis Results
- **File**: `frontend/src/component/VisualizationCanvas.tsx` (line 15-50)
- **Atribut**: Displacement dan ElementResult dengan 12+ parameter
- **Sumber**: Received dari backend FEA analysis
- **Contoh**: Displacement dan stress/strain results lengkap

### Backend Data Structures (6 struktur)

#### 1. Input Data Models (Pydantic)
- **File**: `backend/input_data.py` (line 1-50)
- **Atribut**: Point, Material, PointLoad, WaterLevel, Polygon, Stage
- **Sumber**: Received dari frontend via API
- **Contoh**: Validated data models untuk API endpoints

#### 2. Mesh Data Classes
- **File**: `backend/mesh_generator.py` (line 20-50)
- **Atribut**: Node, Element, BoundaryCondition classes
- **Sumber**: Generated by mesh_generator.py
- **Contoh**: Internal mesh representation

#### 3. FEA Solver Data
- **File**: `backend/fea_solver.py` (line 10-100)
- **Atribut**: FEASolver class dengan 10+ attributes
- **Sumber**: Initialized dari mesh data dan material properties
- **Contoh**: Global stiffness matrix, force vector, displacement vector

#### 4. CST Element Data
- **File**: `backend/cst_element.py` (line 1-50)
- **Atribut**: CSTElement class dengan matrices dan results
- **Sumber**: Created untuk setiap element selama analysis
- **Contoh**: Element stiffness matrix, stress, strain

#### 5. K0 Solver Data
- **File**: `backend/k0_solver.py` (line 10-50)
- **Atribut**: K0Solver class dengan K0 values dan stresses
- **Sumber**: Initialized dari material properties dan water levels
- **Contoh**: K0 values, initial stresses, pore pressures

#### 6. Sequential History Data
- **File**: `backend/sequential_history.py` (line 1-30)
- **Atribut**: SequentialHistory class dengan stage results
- **Sumber**: Maintains history of sequential analysis
- **Contoh**: Stage results, element states, load history

---

## INDEKS API ENDPOINTS

### 1. Generate Mesh
- **Endpoint**: `POST /generate-mesh`
- **Input**: polygons[], point_loads[], water_levels[]
- **Output**: nodes[], elements[], boundary_conditions{}, loads[]
- **File**: `backend/api.py` (line 20-40)

### 2. Run FEA Analysis
- **Endpoint**: `POST /run-fea`
- **Input**: nodes[], elements[], materials[], element_materials[], boundary_conditions{}, loads[], water_levels[]
- **Output**: displacements[], element_results[]
- **File**: `backend/api.py` (line 42-80)

### 3. Run K0 Analysis
- **Endpoint**: `POST /run-k0`
- **Input**: materials[], element_materials[], water_levels[], nodes[], elements[]
- **Output**: k0_values{}, initial_stresses[]
- **File**: `backend/api.py` (line 82-120)

### 4. Run Sequential Analysis
- **Endpoint**: `POST /run-sequential`
- **Input**: stages[], nodes[], elements[], materials[], element_materials[], boundary_conditions{}, loads[], water_levels[]
- **Output**: stage_results{}
- **File**: `backend/api.py` (line 122-160)

---

## INDEKS KOMPONEN FRONTEND

### 1. InputWizard
- **File**: `frontend/src/component/inputwizard.tsx` (line 1-50)
- **Fungsi**: Komponen utama untuk input geometri
- **Props**: 6 props untuk data management
- **State**: currentStep, activeTool, drawingMode

### 2. InputCanvas
- **File**: `frontend/src/component/input panel/InputCanvas.tsx` (line 1-100)
- **Fungsi**: Canvas untuk drawing geometri
- **Props**: 8 props untuk drawing dan data
- **State**: mousePosition, selectedPolygon, isDrawing, tempPoints

### 3. MaterialPanel
- **File**: `frontend/src/component/MaterialPanel.tsx` (line 1-80)
- **Fungsi**: Panel untuk input material properties
- **Props**: 4 props untuk material management
- **State**: editingMaterial, showForm, formData

### 4. AssignMaterialPanel
- **File**: `frontend/src/component/AssignMaterialPanel.tsx` (line 1-60)
- **Fungsi**: Panel untuk assign material ke polygon
- **Props**: 5 props untuk assignment
- **State**: selectedPolygon, selectedMaterial

### 5. StagingWizard
- **File**: `frontend/src/component/StagingWizard.tsx` (line 1-100)
- **Fungsi**: Wizard untuk konfigurasi tahapan
- **Props**: 5 props untuk stage management
- **State**: currentStage, showForm, formData

### 6. MeshWizard
- **File**: `frontend/src/component/MeshWizard.tsx` (line 1-80)
- **Fungsi**: Wizard untuk generate mesh
- **Props**: 7 props untuk mesh generation
- **State**: meshData, isGenerating, previewMode

### 7. VisualizationCanvas
- **File**: `frontend/src/component/VisualizationCanvas.tsx` (line 1-150)
- **Fungsi**: Canvas untuk visualisasi hasil
- **Props**: 5 props untuk visualization
- **State**: plotData, layout, selectedElement

---

## INDEKS ALUR DATA

### Frontend-Backend Integration Flows

#### 1. Mesh Generation Flow
```
InputCanvas → Polygon Data → API Call → mesh_generator.py → Mesh Data → Frontend State
```

#### 2. FEA Analysis Flow
```
Mesh Data + Materials + Loads → API Call → fea_solver.py → Results → VisualizationCanvas
```

#### 3. K0 Analysis Flow
```
Materials + Water Levels → API Call → k0_solver.py → K0 Results → Frontend Display
```

#### 4. Sequential Analysis Flow
```
Stages + Analysis Data → API Call → sequential_history.py → Stage Results → Frontend
```

### State Management Flows

#### 1. User Input Flow
```
User Input → Component → State Update → localStorage → Component Re-render
```

#### 2. Data Persistence Flow
```
State Change → useLocalStorage Hook → localStorage Write → App Load → State Initialization
```

#### 3. API Integration Flow
```
State Data → API Call → Backend Processing → Response → State Update → UI Update
```

---

## KESIMPULAN DOKUMENTASI LENGKAP

Dokumentasi ini mencakup **17 struktur data utama** (11 frontend + 6 backend), **4 API endpoints**, **7 komponen frontend**, dan **7 alur data utama** dalam aplikasi TerraSim.

### Cakupan Dokumentasi:
1. ✅ **Data Structures**: Semua interface, class, dan model data
2. ✅ **Data Sources**: File dan baris kode sumber setiap data
3. ✅ **Data Examples**: Contoh data lengkap untuk setiap struktur
4. ✅ **Application Flow**: Alur aplikasi dari input hingga visualisasi
5. ✅ **Integration**: Integrasi frontend-backend melalui API
6. ✅ **State Management**: State management dan data persistence

### Teknologi yang Didokumentasikan:
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + Plotly.js
- **Backend**: Python + FastAPI + NumPy + SciPy + Triangle
- **Analysis**: FEA + K0 + Sequential Analysis
- **Visualization**: Contour plots + Deformed mesh

Dokumentasi ini memberikan gambaran komprehensif dan detail tentang seluruh struktur data, alur aplikasi, dan integrasi komponen dalam aplikasi TerraSim untuk analisis geoteknik.
