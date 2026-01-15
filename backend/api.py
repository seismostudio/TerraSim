"""
FastAPI Backend for TerraSim FEA Analysis
Handles data from frontend and runs FEA calculations
"""

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, validator
from typing import List, Dict, Any, Optional
import numpy as np
import os
from scipy.spatial import Delaunay
from input_data import Geometry, Material, BoundaryConditions
from fea_solver import FEASolver
from k0_solver import K0Solver
from mesh_generator import MeshGenerator
from cst_element import CSTElement
from sequential_history import SequentialHistory  # ✅ NEW: Import SequentialHistory
import json
import traceback
import sys
import os

app = FastAPI(title="TerraSim FEA API", version="1.0.0")

# Get port from environment variable (Railway sets this)
PORT = int(os.environ.get("PORT", 8000))

# ✅ NEW: Initialize SequentialHistory for the entire application
sequential_history = SequentialHistory()

# Enable CORS for frontend - update origins for production
origins = [
    "http://localhost:5173",  # Development
    "http://localhost:3000",  # Alternative dev port
    "https://your-frontend-domain.vercel.app",  # Production frontend URL
    "*"  # Allow all origins (for testing, remove in production)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for data validation
class Node(BaseModel):
    id: int
    x: float
    y: float

class Element(BaseModel):
    id: int
    node1: int
    node2: int
    node3: int

class BoundaryConditionFullFixed(BaseModel):
    node: int

class BoundaryConditionNormalFixed(BaseModel):
    node: int

class Load(BaseModel):
    node: int
    fx: float
    fy: float

class PointLoad(BaseModel):
    id: str
    x: float
    y: float
    fx: float
    fy: float

class MaterialProperties(BaseModel):
    youngsModulus: float
    poissonsRatio: float
    unitWeightSaturated: float  # ✅ Gamma saturated
    unitWeightUnsaturated: float  # ✅ Gamma unsaturated
    cohesion: float
    frictionAngle: float
    dilationAngle: float  # ✅ Dilation angle (ψ) for plastic flow - REQUIRED field
    thickness: float
    permeability: float
    voidRatio: float
    specificGravity: float

    @validator('dilationAngle')
    def check_dilation_angle_bounds(cls, v):
        """Validate dilation angle bounds"""
        if v < 0:
            raise ValueError('Dilation angle (ψ) cannot be negative. Must be ≥ 0°')
        if v > 90:
            raise ValueError('Dilation angle (ψ) cannot exceed 90°. Must be ≤ 90°')
        return v

    @validator('dilationAngle')
    def check_dilation_angle_vs_friction(cls, v, values):
        """Validate dilation angle against friction angle"""
        if 'frictionAngle' in values and v > values['frictionAngle']:
            raise ValueError(f'Dilation angle (ψ = {v}°) cannot be greater than friction angle (φ = {values["frictionAngle"]}°). Must be ψ ≤ φ')
        return v

    @validator('dilationAngle')
    def check_dilation_angle_practical(cls, v):
        """Warn about unusually high dilation angles"""
        if v > 45:
            print(f"⚠️ Warning: Dilation angle (ψ = {v}°) is unusually high. Typical values are 0° ≤ ψ ≤ φ. Consider using a lower value.")
        return v

class ElementMaterial(BaseModel):
    element_id: int
    material: MaterialProperties

class FEARequest(BaseModel):
    nodes: List[Node]
    elements: List[Element]
    boundaryConditionsFullFixed: List[BoundaryConditionFullFixed]
    boundaryConditionsNormalFixed: List[BoundaryConditionNormalFixed]
    loads: List[Load]
    pointLoads: List[PointLoad] = []  # Add point loads support
    materials: List[ElementMaterial]  # Material per element
    use_k0_procedure: bool = False  # Default to FEA method
    water_level: float = 0.0  # Default water level (backward compatibility)
    water_level_points: List[Dict[str, float]] = []  # ✅ Water level polyline points
    interpolation_method: str = "area_weighted"  # Default interpolation method
    # Stage information
    stage_name: str = "Default Stage"
    stage_id: str = "default"
    active_polygons: List[str] = []
    active_point_loads: List[str] = []
    active_water_levels: List[str] = []
    # Stage information
    stage_sequence: int = 1  # Stage number (1 = Initial, 2 = Construction, etc.)
    is_initial_stage: bool = True  # Whether this is the initial stage
    # ✅ NEW: Initial state for transfer conditions
    initial_stress_state: Dict[str, Any] = {}  # Initial stress state from previous stage
    initial_displacement_state: Dict[str, Any] = {}  # Initial displacement state from previous stage
    initial_pwp_state: Dict[str, Any] = {}  # Initial PWP state from previous stage
    initial_plastic_strain_state: Dict[str, Any] = {}  # Initial plastic strain state from previous stage
    # ✅ NEW: Element active status for sequential analysis
    element_active: List[bool] = []  # Boolean array indicating which elements are active
    previous_stage_active_elements: List[bool] = []  # Boolean array from previous stage

class MeshResponse(BaseModel):
    success: bool
    nodes: List[List[float]] = None
    elements: List[List[int]] = None
    element_materials: List[Dict[str, Any]] = None  # Material info per element
    boundary_nodes: List[int] = None
    boundary_conditions: Dict[str, List[Dict[str, int]]] = None  # Changed to list of objects
    point_load_assignments: List[Dict[str, Any]] = None  # Point load to node assignments
    error: str = None

class FEAResponse(BaseModel):
    success: bool
    message: str
    results: Dict[str, Any] = None
    error: str = None

class MeshRequest(BaseModel):
    polygons: List[Dict[str, Any]]
    materials: List[Dict[str, Any]]
    pointLoads: List[Dict[str, Any]] = []  # Add point loads support



def convert_numpy_to_python(obj):
    """Convert numpy types to Python native types for JSON serialization"""
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.integer):
        return int(obj)
    elif isinstance(obj, np.floating):
        return float(obj)
    elif isinstance(obj, np.bool_):
        return bool(obj)
    elif isinstance(obj, dict):
        return {key: convert_numpy_to_python(value) for key, value in obj.items()}
    elif isinstance(obj, list):
        return [convert_numpy_to_python(item) for item in obj]
    else:
        return obj

@app.get("/")
async def root():
    return {"message": "TerraSim FEA API is running", "port": PORT}

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "message": "TerraSim FEA API is running", "port": PORT}

@app.post("/api/fea/analyze", response_model=FEAResponse)
async def run_fea_analysis(request: FEARequest):
    try:
        print("------------------------------------------------")
        print("🔧 ANALYSIS SETTINGS RECEIVED:")
        print(f"✅ Stage: {request.stage_name} (ID: {request.stage_id})")
        print(f"✅ use_k0_procedure: {request.use_k0_procedure}")
        print(f"✅ water_level: {request.water_level}")
        print(f"✅ interpolation_method: {request.interpolation_method}")
        
        print("------------------------------------------------")
        print(f"📊 Active polygons: {len(request.active_polygons)}")
        print(f"📊 Active point loads: {len(request.active_point_loads)}")
        print(f"📊 Active water levels: {len(request.active_water_levels)}")
        print(f"📊 Nodes: {len(request.nodes)}")
        print(f"📊 Elements: {len(request.elements)}")
        print(f"📊 Materials: {len(request.materials)}")
        
        print("------------------------------------------------")
        print("Received FEA request with data:")
        print(f"Nodes: {len(request.nodes)}")
        print(f"Elements: {len(request.elements)}")
        print(f"Materials: {len(request.materials)}")
        
        # Convert frontend data to backend format
        geometry = Geometry()
        
        # Update nodes from frontend
        nodes_array = []
        for node in request.nodes:
            nodes_array.append([node.x, node.y])
        geometry.nodes = np.array(nodes_array)
        geometry.num_nodes = len(geometry.nodes)
        print(f"Geometry nodes shape: {geometry.nodes.shape}")
        
        # Update elements from frontend
        elements_array = []
        for element in request.elements:
            elements_array.append([element.node1, element.node2, element.node3])
        geometry.elements = np.array(elements_array) - 1  # Convert to 0-based indexing
        geometry.num_elements = len(geometry.elements)
        print(f"Geometry elements shape: {geometry.elements.shape}")
        
        # ✅ NEW: Set element active status
        if request.element_active:
            # Use provided element_active array
            geometry.element_active = np.array(request.element_active, dtype=bool)
            print(f"✅ Using provided element_active array: {len(geometry.element_active)} elements")
            print(f"✅ Active elements: {np.sum(geometry.element_active)}")
            print(f"✅ Inactive elements: {np.sum(~geometry.element_active)}")
        else:
            # Default: all elements active
            geometry.element_active = np.ones(geometry.num_elements, dtype=bool)
            print(f"✅ Using default element_active (all active): {geometry.num_elements} elements")
        
        # Create element materials mapping
        element_materials = []
        print(f"🔧 Processing {len(request.elements)} elements")
        print(f"🔧 Available materials: {len(request.materials)}")
        
        for i, element in enumerate(request.elements):
            # print(f"🔧 Processing element {i} (ID: {element.id})")
            
            # Find material for this element
            element_material = None
            for mat_data in request.materials:
                if mat_data.element_id == element.id:  # Use element.id directly
                    element_material = {
                        'youngsModulus': mat_data.material.youngsModulus,
                        'poissonsRatio': mat_data.material.poissonsRatio,
                        'unitWeightSaturated': mat_data.material.unitWeightSaturated,  # ✅ Use saturated
                        'unitWeightUnsaturated': mat_data.material.unitWeightUnsaturated,  # ✅ Use unsaturated
                        'cohesion': mat_data.material.cohesion,
                        'frictionAngle': mat_data.material.frictionAngle,
                        'dilationAngle': mat_data.material.dilationAngle, # ✅ Add dilationAngle
                        'thickness': mat_data.material.thickness,
                        'permeability': mat_data.material.permeability,
                        'voidRatio': mat_data.material.voidRatio,
                        'specificGravity': mat_data.material.specificGravity
                    }
                    break
            
            # ❌ NO DEFAULT VALUES - User must provide material data
            if not element_material:
                print(f"❌ Element {i} has no material assigned!")
                print(f"❌ Available material element_ids: {[mat.element_id for mat in request.materials]}")
                raise ValueError(f"Element {i} has no material assigned. Please assign material to all polygons before running analysis.")
            
            element_materials.append({
                'element_id': i,  # ✅ Use enumerate index for consistent material assignment
                'material': element_material
            })
        
        print(f"Element materials: {len(element_materials)} material assignments")
        
        # Update boundary conditions
        boundary_conditions = BoundaryConditions()
        boundary_conditions.fixed_nodes = [bc.node - 1 for bc in request.boundaryConditionsFullFixed]  # Convert to 0-based
        boundary_conditions.normal_fixed_nodes = [bc.node - 1 for bc in request.boundaryConditionsNormalFixed]  # Convert to 0-based

        print("------------------------------------------------")
        
        # Update applied forces from both loads and point loads
        applied_forces = []
        
        # Add regular loads
        for load in request.loads:
            applied_forces.append([load.node - 1, load.fx, load.fy])  # Convert to 0-based
        
        # Add point loads (find closest node to point load position)
        # Only process active point loads for this stage
        active_point_loads = [pl for pl in request.pointLoads if pl.id in request.active_point_loads]
        print(f"Processing {len(active_point_loads)} active point loads out of {len(request.pointLoads)} total")
        
        for point_load in active_point_loads:
            # Find the closest node to the point load position
            closest_node = None
            min_distance = float('inf')
            
            for i, node_coords in enumerate(geometry.nodes):
                distance = ((node_coords[0] - point_load.x) ** 2 + (node_coords[1] - point_load.y) ** 2) ** 0.5
                if distance < min_distance:
                    min_distance = distance
                    closest_node = i
            
            if closest_node is not None:
                applied_forces.append([closest_node, point_load.fx, point_load.fy])
                print(f"Active point load {point_load.id} assigned to node {closest_node} (distance: {min_distance:.3f}m)")
        
        boundary_conditions.applied_forces = np.array(applied_forces)
        print(f"Applied forces: {boundary_conditions.applied_forces}")
        print(f"Total forces: {len(applied_forces)} (regular: {len(request.loads)}, active point loads: {len(active_point_loads)})")
        
        print("------------------------------------------------")
        print("Creating solver...")
        print("------------------------------------------------")
        
        # Choose solver based on analysis type
        if request.use_k0_procedure:
            print("🔧 Using K0 Solver for K0 procedure analysis")
            print("------------------------------------------------")
            # ✅ NEW: Prepare previous_stage_active_elements for K0Solver
            previous_stage_active_elements = None
            if request.previous_stage_active_elements:
                previous_stage_active_elements = np.array(request.previous_stage_active_elements, dtype=bool)
                print(f"✅ K0: Using previous_stage_active_elements: {len(previous_stage_active_elements)} elements")
            else:
                print(f"ℹ️ K0: No previous_stage_active_elements provided")
            
            solver = K0Solver(
                geometry, 
                element_materials, 
                boundary_conditions, 
                water_level=request.water_level,
                water_level_points=request.water_level_points,
                is_initial_stage=request.is_initial_stage,
                initial_stress_state=request.initial_stress_state,
                initial_displacement_state=request.initial_displacement_state,
                initial_pwp_state=request.initial_pwp_state,
                initial_plastic_strain_state=request.initial_plastic_strain_state,
                previous_stage_active_elements=previous_stage_active_elements  # ✅ NEW: Pass active elements
            )
            print("K0 solver created successfully")
            print("------------------------------------------------")
            print("Solving K0 system...")
            print("------------------------------------------------")
            stage_results = solver.solve()
            displacements = stage_results['displacements']
            print("------------------------------------------------")
            print(f"K0 analysis completed - zero displacements expected")
            print("------------------------------------------------")
        else:
            print("🔧 Using FEA Solver for standard FEA analysis")
            print("------------------------------------------------")
            
            # ✅ NEW: Check if initial state is provided for transfer conditions
            if request.initial_stress_state:
                print(f"✅ Initial state provided for transfer conditions")
                print(f"   - Stress state: {len(request.initial_stress_state)} elements")
                print(f"   - Displacement state: {len(request.initial_displacement_state)} nodes")
                print(f"   - PWP state: {len(request.initial_pwp_state)} nodes")
                print(f"   - Plastic strain state: {len(request.initial_plastic_strain_state)} elements")
            else:
                print(f"ℹ️ No initial state provided (initial stage or no previous stage)")
            
            # ✅ NEW: Prepare previous_stage_active_elements for FEASolver
            previous_stage_active_elements = None
            if request.previous_stage_active_elements:
                previous_stage_active_elements = np.array(request.previous_stage_active_elements, dtype=bool)
                print(f"✅ Using previous_stage_active_elements: {len(previous_stage_active_elements)} elements")
            else:
                print(f"ℹ️ No previous_stage_active_elements provided")
            
            solver = FEASolver(
                geometry, 
                element_materials, 
                boundary_conditions, 
                water_level=request.water_level,
                water_level_points=request.water_level_points,
                is_initial_stage=request.is_initial_stage,
                initial_stress_state=request.initial_stress_state,
                initial_displacement_state=request.initial_displacement_state,
                initial_pwp_state=request.initial_pwp_state,
                initial_plastic_strain_state=request.initial_plastic_strain_state,
                previous_stage_active_elements=previous_stage_active_elements  # ✅ NEW: Pass active elements
            )
            print("FEA solver created successfully")
            print("------------------------------------------------")
            print("Solving FEA system...")
            print("------------------------------------------------")
            displacements = solver.solve()
            print(f"Displacements shape: {displacements.shape}")
            print(f"Displacements: {displacements[:10]}")  # Show first 10 values
        
        print("------------------------------------------------")
        print(f"Water level:")
        print(f"Water level points: {request.water_level_points}")
        print(f"Number of water level points: {len(request.water_level_points)}")
        
        print("------------------------------------------------")        
        print("Getting element results...")
        element_results = solver.get_element_results()
        print(f"Element results length: {len(element_results)}")
        
        # ✅ FIX: Filter element results to only include active elements
        # Use enumerate index consistently (both K0 and FEA use enumerate index)
        # Get active element indices from request (enumerate order)
        active_element_indices = list(range(len(request.elements)))  # 0, 1, 2, 3, ...
        filtered_element_results = [result for result in element_results if result.get('element_index') in active_element_indices]
        print(f"Filtered element results length: {len(filtered_element_results)}")
        if filtered_element_results:
            print(f"First filtered element result: {filtered_element_results[0]}")
        else:
            print("⚠️ Warning: No filtered element results found!")
            print(f"Active element indices: {active_element_indices[:10]}...")  # Show first 10
            print(f"Available element_index values: {[result.get('element_index') for result in element_results[:10]]}...")  # Show first 10
        
        print("------------------------------------------------")
        print("Getting nodal displacements...")
        nodal_displacements = solver.get_nodal_displacements()
        print(f"Nodal displacements length: {len(nodal_displacements)}")
        if nodal_displacements:
            print(f"First nodal displacement: {nodal_displacements[0]}")
        
        print("------------------------------------------------")
        print("Getting nodal stress/strain results...")
        # Both solvers now use the same method signature
        nodal_stress_strain = solver.get_nodal_stress_strain_results(
            interpolation_method=request.interpolation_method
        )
        print("------------------------------------------------")
        print(f"Nodal stress/strain results length: {len(nodal_stress_strain)}")
        if nodal_stress_strain:
            print(f"First nodal stress/strain: {nodal_stress_strain[0]}")
        
        print("------------------------------------------------")
        print("Getting soil-specific results...")
        soil_results = solver.get_soil_specific_results()
        print("Soil results")
        print(f"{soil_results}")
        
        # ✅ DEBUG: Show soil_results values for all stages
        print(f"🔧 DEBUG: Soil results for {request.stage_name}:")
        print(f"   - max_total_stress_x: {soil_results.get('max_total_stress_x', 'NOT_FOUND')}")
        print(f"   - min_total_stress_x: {soil_results.get('min_total_stress_x', 'NOT_FOUND')}")
        print(f"   - max_total_stress_y: {soil_results.get('max_total_stress_y', 'NOT_FOUND')}")
        print(f"   - min_total_stress_y: {soil_results.get('min_total_stress_y', 'NOT_FOUND')}")
        
        # Convert all numpy arrays to Python types for JSON serialization
        soil_results_converted = convert_numpy_to_python(soil_results)
        
        # ✅ DEBUG: Show soil_results values
        print(f"🔧 Soil results from solver.get_soil_specific_results():")
        print(f"   - max_total_stress_x: {soil_results_converted.get('max_total_stress_x', 'NOT_FOUND')}")
        print(f"   - min_total_stress_x: {soil_results_converted.get('min_total_stress_x', 'NOT_FOUND')}")
        print(f"   - max_total_stress_y: {soil_results_converted.get('max_total_stress_y', 'NOT_FOUND')}")
        print(f"   - min_total_stress_y: {soil_results_converted.get('min_total_stress_y', 'NOT_FOUND')}")
        nodal_displacements_converted = convert_numpy_to_python(nodal_displacements)
        nodal_stress_strain_converted = convert_numpy_to_python(nodal_stress_strain)
        filtered_element_results_converted = convert_numpy_to_python(filtered_element_results)
        
        # Calculate summary statistics
        if request.use_k0_procedure:
            # For K0 procedure, displacements are zero
            max_displacement = 0.0
            min_displacement = 0.0
            max_settlement = 0.0
        else:
            # For FEA, calculate from actual displacements
            max_displacement = max([d['magnitude'] for d in nodal_displacements_converted]) if nodal_displacements_converted else 0
            min_displacement = min([d['magnitude'] for d in nodal_displacements_converted]) if nodal_displacements_converted else 0
            max_settlement = max([abs(d['v']) for d in nodal_displacements_converted]) if nodal_displacements_converted else 0
        
        # ✅ FIX: Get soil results for summary
        min_safety_factor = soil_results_converted.get('min_safety_factor', 0)
        max_effective_principal_stress_1 = soil_results_converted.get('max_effective_principal_stress_1', 0)
        max_pore_water_pressure = soil_results_converted.get('max_pore_water_pressure', 0)
        min_pore_water_pressure = soil_results_converted.get('min_pore_water_pressure', 0)
        
        # ✅ FIX: Use solver's get_summary method for consistent summary calculation
        if hasattr(solver, 'get_summary'):
            summary = solver.get_summary(soil_results_converted)
            # ✅ DEBUG: Show summary values
            print(f"🔧 Summary from solver.get_summary():")
            print(f"   - max_total_stress_x: {summary.get('max_total_stress_x', 'NOT_FOUND')}")
            print(f"   - min_total_stress_x: {summary.get('min_total_stress_x', 'NOT_FOUND')}")
            print(f"   - max_total_stress_y: {summary.get('max_total_stress_y', 'NOT_FOUND')}")
            print(f"   - min_total_stress_y: {summary.get('min_total_stress_y', 'NOT_FOUND')}")
        else:
            # Fallback to manual calculation
            summary = {
                'max_displacement': max_displacement,
                'min_displacement': min_displacement,
                'max_settlement': max_settlement,
                'min_safety_factor': min_safety_factor,
                'max_effective_principal_stress_1': max_effective_principal_stress_1,
                'max_pore_water_pressure': max_pore_water_pressure,
                'min_pore_water_pressure': min_pore_water_pressure,
                'max_total_stress_x': soil_results_converted.get('max_total_stress_x', 0.0),
                'min_total_stress_x': soil_results_converted.get('min_total_stress_x', 0.0),
                'max_total_stress_y': soil_results_converted.get('max_total_stress_y', 0.0),
                'min_total_stress_y': soil_results_converted.get('min_total_stress_y', 0.0),
                'stability_assessment': "STABLE" if min_safety_factor > 1.5 else "MARGINALLY STABLE" if min_safety_factor > 1.0 else "UNSTABLE"
            }
        
        # Get active nodes for current stage
        active_nodes = solver.get_active_nodes()
        
        # Prepare response data
        response_data = {
            'displacements': convert_numpy_to_python(displacements),
            'element_results': filtered_element_results_converted,
            'nodal_displacements': nodal_displacements_converted,
            'nodal_stress_strain': nodal_stress_strain_converted,
            'soil_results': soil_results_converted,
            'active_nodes': convert_numpy_to_python(active_nodes),
            'stage_info': {
                'stage_name': request.stage_name,
                'stage_id': request.stage_id,
                'stage_sequence': request.stage_sequence,
                'is_initial_stage': request.is_initial_stage,
                'use_k0_procedure': request.use_k0_procedure,
                'calculation_type': 'K0 Procedure' if request.use_k0_procedure else 'FEA'
            },
            'summary': summary
        }
        
        # Add solver-specific data if available
        if hasattr(solver, 'get_stage_results'):
            stage_results = solver.get_stage_results()
            if request.use_k0_procedure:
                response_data['k0_stage_results'] = convert_numpy_to_python(stage_results)
            else:
                # For FEA, include PWP history in response
                response_data['pwp_history'] = convert_numpy_to_python(stage_results.get('pwp_history', {}))
        
        analysis_type = "K0 procedure" if request.use_k0_procedure else "FEA"
        print("------------------------------------------------")
        print(f"{analysis_type} analysis completed successfully")
        print("------------------------------------------------")
        print(f"Results summary: {response_data['summary']}")
        print("------------------------------------------------")
        print("")
        

        
        return FEAResponse(
            success=True,
            message=f"{analysis_type} analysis completed successfully",
            results=response_data
        )
        
    except Exception as e:
        analysis_type = "K0 procedure" if request.use_k0_procedure else "FEA"
        print(f"Error in {analysis_type} analysis: {e}")
        import traceback
        traceback.print_exc()
        return FEAResponse(
            success=False,
            message=f"{analysis_type} analysis failed",
            error=str(e)
        )


@app.post("/api/mesh/generate", response_model=MeshResponse)
async def generate_mesh(request: Request):
    try:
        print("Received mesh generation request")
        request_data = await request.json()
        
        # Debug: Log all request data keys
        print(f"DEBUG: Request data keys: {list(request_data.keys())}")
        print(f"DEBUG: Full request data: {json.dumps(request_data, indent=2)}")

        # Handle both old and new formats
        if 'polygons' in request_data:
            polygons_data = request_data['polygons']
            print("Using new format: polygons")
        elif 'polygon' in request_data:
            polygons_data = [request_data['polygon']]
            print("Using old format: polygon")
        else:
            return MeshResponse(
                success=False,
                error="No polygon or polygons provided"
            )

        # Extract materials data if available
        materials_data = request_data.get('materials', [])
        print(f"Materials data: {len(materials_data)} materials provided")
        print(f"Materials data structure: {json.dumps(materials_data, indent=2)}")
        for i, material in enumerate(materials_data):
            print(f"Material {i}: id={material.get('id', 'NO_ID')}, name={material.get('name', 'NO_NAME')}")
            print(f"  - unitWeightSaturated: {material.get('unitWeightSaturated', 'MISSING')}")
            print(f"  - unitWeightUnsaturated: {material.get('unitWeightUnsaturated', 'MISSING')}")

        # Debug: Log point loads data
        point_loads_debug = request_data.get('pointLoads', [])
        print(f"DEBUG: Received pointLoads data: {len(point_loads_debug)} items")
        print(f"DEBUG: pointLoads content: {point_loads_debug}")
        
        if not polygons_data:
            return MeshResponse(
                success=False,
                error="No polygons provided"
            )

        # STEP 2: Generate mesh dengan snap nodes
        if len(polygons_data) >= 2:
            print("=== MESH GENERATION DEBUG ===")
            print(f"Number of polygons: {len(polygons_data)}")
            for i, poly in enumerate(polygons_data):
                print(f"Polygon {i+1}: mesh_size={poly.get('mesh_size', 'NOT_FOUND')}, meshSize={poly.get('meshSize', 'NOT_FOUND')}, boundary_refinement_factor={poly.get('boundary_refinement_factor', 'NOT_FOUND')}, boundaryRefinementFactor={poly.get('boundaryRefinementFactor', 'NOT_FOUND')}")
            
            # Handle both snake_case and camelCase
            mesh_size = polygons_data[0].get('mesh_size', polygons_data[0].get('meshSize', 1.0))
            print(f"Using mesh_size: {mesh_size}")
            tolerance = mesh_size * 0.1  # Tolerance untuk snap nodes
            
            all_nodes = []
            all_elements = []
            node_offset = 0
            
            # Mesh polygon pertama
            print("Meshing polygon 1...")
            poly1_vertices = np.array([[v['x'], v['y']] for v in polygons_data[0]['vertices']])
            from mesh_generator import MeshGenerator
            class Polygon:
                def __init__(self, vertices, mesh_size, boundary_refinement_factor=0.5):
                    self.vertices = vertices
                    self.mesh_size = mesh_size
                    self.boundary_refinement_factor = boundary_refinement_factor
            
            # Get boundary refinement factor from first polygon (handle both formats)
            boundary_refinement_factor = polygons_data[0].get('boundary_refinement_factor', 
                                                             polygons_data[0].get('boundaryRefinementFactor', 0.5))
            polygon1 = Polygon(poly1_vertices, mesh_size, boundary_refinement_factor)
            mesh_gen1 = MeshGenerator(polygon1)
            nodes1, elements1, boundary_nodes1 = mesh_gen1.generate_mesh()
            
            if nodes1 is None or len(nodes1) == 0:
                return MeshResponse(success=False, nodes=[], elements=[], boundary_conditions={}, error="Mesh generation failed for polygon 1!")
            
            # Add polygon 1 nodes and elements
            all_nodes.extend(nodes1.tolist())
            all_elements.extend(elements1.tolist())
            node_offset = len(all_nodes)
            
            print(f"Polygon 1: {len(nodes1)} nodes, {len(elements1)} elements")
            
            # Mesh polygon berikutnya dengan snap
            for poly_idx in range(1, len(polygons_data)):
                print(f"Meshing polygon {poly_idx + 1} with snap...")
                poly_vertices = np.array([[v['x'], v['y']] for v in polygons_data[poly_idx]['vertices']])
                
                # Get boundary refinement factor from current polygon (handle both formats)
                poly_boundary_refinement = polygons_data[poly_idx].get('boundary_refinement_factor', 
                                                                      polygons_data[poly_idx].get('boundaryRefinementFactor', boundary_refinement_factor))
                polygon_obj = Polygon(poly_vertices, mesh_size, poly_boundary_refinement)
                mesh_gen = MeshGenerator(polygon_obj)
                nodes, elements, boundary_nodes = mesh_gen.generate_mesh()
                
                if nodes is None or len(nodes) == 0:
                    continue
                
                # Snap nodes ke existing nodes
                snapped_nodes = []
                node_mapping = {}  # new_node_idx -> existing_node_idx
                
                for i, new_node in enumerate(nodes):
                    # Check if this node is close to any existing node
                    snapped = False
                    for j, existing_node in enumerate(all_nodes):
                        distance = np.sqrt((new_node[0] - existing_node[0])**2 + (new_node[1] - existing_node[1])**2)
                        if distance <= tolerance:
                            node_mapping[i] = j
                            snapped = True
                            break
                    
                    if not snapped:
                        # Add new node
                        node_mapping[i] = len(all_nodes)
                        all_nodes.append(new_node.tolist())
                        snapped_nodes.append(new_node.tolist())
                
                # Update elements with correct node indices
                for element in elements:
                    new_element = [node_mapping[node_idx] for node_idx in element]
                    all_elements.append(new_element)
                
                print(f"Polygon {poly_idx + 1}: {len(snapped_nodes)} new nodes, {len(elements)} elements")
            
            # Helper function to check if point is inside polygon
            def point_in_polygon(point, polygon_vertices):
                x, y = point
                n = len(polygon_vertices)
                inside = False
                
                if n < 3:
                    return False
                
                j = n - 1
                for i in range(n):
                    xi, yi = polygon_vertices[i]
                    xj, yj = polygon_vertices[j]
                    
                    if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
                        inside = not inside
                    
                    j = i
                
                return inside
            
            # Extract point loads and create priority nodes
            point_loads = request_data.get('pointLoads', [])
            priority_nodes = []
            point_load_assignments = []  # Track which point loads get assigned to which nodes
            
            for i, point_load in enumerate(point_loads):
                priority_nodes.append({
                    'id': i,  # Point loads get priority IDs (0, 1, 2, ...)
                    'x': point_load['x'],
                    'y': point_load['y'],
                    'type': 'point_load',
                    'load': {
                        'fx': point_load['fx'],
                        'fy': point_load['fy']
                    }
                })
            
            print(f"Found {len(priority_nodes)} point loads as priority nodes")
            
            # Process priority nodes (point loads) to ensure they become mesh nodes
            if len(priority_nodes) > 0:
                print("Processing priority nodes to ensure they become mesh nodes...")
                
                # Add priority node coordinates directly as nodes (user is responsible for placement)
                for priority_node in priority_nodes:
                    priority_x = priority_node['x']
                    priority_y = priority_node['y']
                    point_load_id = priority_node['id']
                    
                    print(f"DEBUG: Adding priority node ({priority_x}, {priority_y})")
                    
                    # Check if this point is already close to an existing node
                    node_exists = False
                    assigned_node_idx = None
                    for existing_node_idx, existing_node in enumerate(all_nodes):
                        distance = np.sqrt((existing_node[0] - priority_x)**2 + (existing_node[1] - priority_y)**2)
                        if distance <= mesh_size * 0.1:  # Small tolerance
                            node_exists = True
                            assigned_node_idx = existing_node_idx
                            print(f"Priority node ({priority_x}, {priority_y}) already exists at node {existing_node_idx}")
                            break
                    
                    # If priority node doesn't exist, add it
                    if not node_exists:
                        all_nodes.append([priority_x, priority_y])
                        assigned_node_idx = len(all_nodes) - 1
                        print(f"Added priority node ({priority_x}, {priority_y}) as node {assigned_node_idx}")
                    else:
                        print(f"Priority node ({priority_x}, {priority_y}) already exists, not adding duplicate")
                    
                    # Record the assignment
                    point_load_assignments.append({
                        'point_load_id': point_loads[point_load_id]['id'],  # Use the original point load ID
                        'assigned_node_id': assigned_node_idx + 1,  # Convert to 1-based for frontend
                        'x': priority_x,
                        'y': priority_y,
                        'fx': priority_node['load']['fx'],
                        'fy': priority_node['load']['fy']
                    })
            
            # Re-triangulate the mesh with the new nodes
            print("Re-triangulating mesh with priority nodes...")
            
            # Convert nodes to numpy array for triangulation
            nodes_array = np.array(all_nodes)
            
            # Perform Delaunay triangulation
            try:
                tri = Delaunay(nodes_array)
                all_elements = tri.simplices.tolist()
                print(f"Re-triangulation successful: {len(all_elements)} elements")
                
                # Filter elements to only keep those inside the geometry
                print("Filtering elements to keep only those inside geometry...")
                filtered_elements = []
                
                for element in all_elements:
                    # Calculate element centroid
                    element_centroid = np.mean([all_nodes[node_idx] for node_idx in element], axis=0)
                    
                    # Check if element centroid is inside any polygon
                    element_inside = False
                    for polygon_data in polygons_data:
                        polygon_vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
                        if point_in_polygon(element_centroid, polygon_vertices):
                            element_inside = True
                            break
                    
                    if element_inside:
                        filtered_elements.append(element)
                
                all_elements = filtered_elements
                print(f"After filtering: {len(all_elements)} elements inside geometry")
                
            except Exception as e:
                print(f"Re-triangulation failed: {e}")
                # Keep original elements if triangulation fails
                pass
            
            # Create element-material mapping using mesh generator
            print("Creating element-material mapping...")
            print(f"Number of polygons: {len(polygons_data)}")
            print(f"Number of materials: {len(materials_data)}")
            
            # Use mesh generator to create element-material mapping
            from mesh_generator import MeshGenerator
            
            # Create a dummy polygon for mesh generator (we already have the mesh)
            dummy_polygon = type('Polygon', (), {
                'vertices': np.array([[0, 0], [1, 0], [1, 1], [0, 1]]),
                'mesh_size': mesh_size,
                'boundary_refinement_factor': boundary_refinement_factor
            })()
            
            mesh_gen = MeshGenerator(dummy_polygon)
            
            # Create priority nodes from point loads
            priority_nodes = []
            point_loads = request_data.get('pointLoads', [])
            for i, point_load in enumerate(point_loads):
                priority_nodes.append({
                    'id': i,
                    'x': point_load['x'],
                    'y': point_load['y'],
                    'type': 'point_load',
                    'load': {
                        'fx': point_load['fx'],
                        'fy': point_load['fy']
                    }
                })
            
            # Create element-material mapping manually since we already have the mesh
            element_materials = []
            for i, element in enumerate(all_elements):
                element_centroid = np.mean([all_nodes[node_idx] for node_idx in element], axis=0)
                
                # Find which polygon contains this element
                element_material = None
                for polygon_data in polygons_data:
                    if 'materialId' in polygon_data:
                        material_id = polygon_data['materialId']
                        for material in materials_data:
                            if material.get('id') == material_id:
                                # Check if centroid is inside this polygon
                                polygon_vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
                                if point_in_polygon(element_centroid, polygon_vertices):
                                    element_material = material
                                    break
                        if element_material:
                            break
                
                if not element_material:
                    raise ValueError(f"Element {i + 1} has no material assigned. Please assign material to all polygons before generating mesh.")
                
                print(f"Element {i + 1} assigned material: id={element_material.get('id', 'NO_ID')}, name={element_material.get('name', 'NO_NAME')}")
                print(f"  - unitWeightSaturated: {element_material.get('unitWeightSaturated', 'MISSING')}")
                print(f"  - unitWeightUnsaturated: {element_material.get('unitWeightUnsaturated', 'MISSING')}")
                
                element_materials.append({
                    'element_id': i + 1,
                    'material': element_material
                })
            

            
            # Verify all elements have materials assigned
            assigned_element_ids = [em['element_id'] for em in element_materials]
            expected_element_ids = list(range(1, len(all_elements) + 1))  # 1-based
            missing_ids = set(expected_element_ids) - set(assigned_element_ids)
            if missing_ids:
                print(f"WARNING: Missing element IDs: {sorted(missing_ids)}")
            else:
                print("All element IDs are assigned correctly")
            
            # Format response
            nodes_data = [[float(x), float(y)] for x, y in all_nodes]
            elements_data = [[int(n) for n in elem] for elem in all_elements]
            boundary_conditions = generate_boundary_conditions(all_nodes, all_elements)
            
            print(f"Final mesh: {len(all_nodes)} total nodes, {len(all_elements)} total elements")
            print(f"Element materials: {len(element_materials)} material assignments")
            print(f"Point load assignments: {len(point_load_assignments)} assignments")
            return MeshResponse(
                success=True, 
                nodes=nodes_data, 
                elements=elements_data, 
                element_materials=element_materials,
                boundary_conditions=boundary_conditions,
                point_load_assignments=point_load_assignments,
                error=""
            )

        else:
            # Single polygon case
            print("=== SINGLE POLYGON MESH GENERATION DEBUG ===")
            print("Processing single polygon...")
            
            # Extract point loads and create priority nodes
            point_loads = request_data.get('pointLoads', [])
            priority_nodes = []
            
            for i, point_load in enumerate(point_loads):
                priority_nodes.append({
                    'id': i,  # Point loads get priority IDs (0, 1, 2, ...)
                    'x': point_load['x'],
                    'y': point_load['y'],
                    'type': 'point_load',
                    'load': {
                        'fx': point_load['fx'],
                        'fy': point_load['fy']
                    }
                })
            
            print(f"Found {len(priority_nodes)} point loads as priority nodes")
            
            polygon_data = polygons_data[0]
            vertices = np.array([[v['x'], v['y']] for v in polygon_data['vertices']])
            
            # Handle both snake_case and camelCase
            mesh_size = polygon_data.get('mesh_size', polygon_data.get('meshSize', 1.0))
            print(f"Using mesh_size: {mesh_size}")
            
            # Create polygon object
            class Polygon:
                def __init__(self, vertices, mesh_size, boundary_refinement_factor=0.5):
                    self.vertices = vertices
                    self.mesh_size = mesh_size
                    self.boundary_refinement_factor = boundary_refinement_factor
            
            # Get boundary refinement factor from polygon data (handle both formats)
            boundary_refinement_factor = polygon_data.get('boundary_refinement_factor', 
                                                         polygon_data.get('boundaryRefinementFactor', 0.5))
            polygon = Polygon(vertices, mesh_size, boundary_refinement_factor)
            
            # Generate mesh with priority nodes if point loads exist
            from mesh_generator import MeshGenerator
            mesh_gen = MeshGenerator(polygon)
            
            if len(priority_nodes) > 0:
                # Use priority nodes method for single polygon with point loads
                mesh_result = mesh_gen.generate_mesh_with_priority_nodes(
                    [polygon_data],  # Single polygon as list
                    materials_data, 
                    priority_nodes
                )
                
                if mesh_result is None or len(mesh_result) != 4:
                    return MeshResponse(
                        success=False,
                        error="Mesh generation failed for single polygon with point loads"
                    )
                
                nodes, elements, boundary_nodes, element_materials = mesh_result
            else:
                # Regular mesh generation without point loads
                nodes, elements, boundary_nodes = mesh_gen.generate_mesh()
                
                if nodes is None or len(nodes) == 0:
                    return MeshResponse(
                        success=False,
                        error="Mesh generation failed for single polygon"
                    )
                
                # Create element-material mapping for single polygon
                element_materials = []
                
                # Get material for this polygon
                polygon_material = None
                if 'materialId' in polygon_data and materials_data:
                    material_id = polygon_data['materialId']
                    for material in materials_data:
                        if material.get('id') == material_id:
                            polygon_material = material
                            break
                
                # If no material assigned, raise error
                if not polygon_material:
                    raise ValueError("Single polygon has no material assigned. Please assign material to polygon before generating mesh.")
                
                # Assign material to all elements
                for elem_idx in range(len(elements)):
                    element_materials.append({
                        'element_id': elem_idx + 1,  # Convert to 1-based indexing for frontend compatibility
                        'material': polygon_material
                    })
            
            # Format response
            nodes_data = [[float(x), float(y)] for x, y in nodes]
            elements_data = [[int(n) for n in elem] for elem in elements]
            boundary_conditions = generate_boundary_conditions(nodes_data, elements_data)
            
            print(f"Single polygon mesh: {len(nodes)} nodes, {len(elements)} elements")
            print(f"Element materials: {len(element_materials)} material assignments")
            return MeshResponse(
                success=True, 
                nodes=nodes_data, 
                elements=elements_data, 
                element_materials=element_materials,
                boundary_conditions=boundary_conditions, 
                error=""
            )

    except Exception as e:
        print(f"Error in mesh generation: {e}")
        import traceback
        traceback.print_exc()
        return MeshResponse(
            success=False,
            error=str(e)
        )

def generate_boundary_conditions(all_nodes, all_elements):
    """Generate boundary conditions for combined mesh"""
    all_nodes_np = np.array(all_nodes)
    min_x = np.min(all_nodes_np[:, 0])
    max_x = np.max(all_nodes_np[:, 0])
    min_y = np.min(all_nodes_np[:, 1])
    max_y = np.max(all_nodes_np[:, 1])
    tolerance = 1e-8
    
    print(f"Global mesh bounds: x=[{min_x:.6f}, {max_x:.6f}], y=[{min_y:.6f}, {max_y:.6f}]")
    
    # Identify boundary nodes based on edge detection
    boundary_nodes = set()
    
    # Calculate edge frequency for each edge
    edge_count = {}
    for element in all_elements:
        edges = [
            tuple(sorted([element[0], element[1]])),
            tuple(sorted([element[1], element[2]])),
            tuple(sorted([element[2], element[0]]))
        ]
        for edge in edges:
            edge_count[edge] = edge_count.get(edge, 0) + 1
    
    # Edges that appear only once are boundary edges
    boundary_edges = [edge for edge, count in edge_count.items() if count == 1]
    
    # Nodes that are in boundary edges are boundary nodes
    for edge in boundary_edges:
        boundary_nodes.add(edge[0])
        boundary_nodes.add(edge[1])
    
    print(f"Boundary nodes detected: {sorted(list(boundary_nodes))}")
    
    all_full_fixed = []
    all_normal_fixed = []
    
    # Assign boundary conditions
    for idx, (x, y) in enumerate(all_nodes_np):
        # Full Fixed: nodes at global y minimum AND on boundary
        if abs(y - min_y) < tolerance and idx in boundary_nodes:
            all_full_fixed.append({'node': idx})
            print(f"FF node {idx}: ({x:.6f}, {y:.6f}) - y_min={min_y:.6f} - BOUNDARY")
        
        # Normal Fixed: nodes at global x minimum or x maximum AND on boundary
        if (abs(x - min_x) < tolerance or abs(x - max_x) < tolerance) and idx in boundary_nodes:
            all_normal_fixed.append({'node': idx})
            print(f"NF node {idx}: ({x:.6f}, {y:.6f}) - x_min={min_x:.6f}, x_max={max_x:.6f} - BOUNDARY")
    
    # Ensure sufficient boundary conditions to prevent rigid body motion
    if len(all_full_fixed) < 2:
        print("WARNING: Insufficient full fixed BC, adding more...")
        # Add more full fixed nodes at corners
        for idx, (x, y) in enumerate(all_nodes_np):
            if idx in boundary_nodes:
                # Add corner nodes as full fixed
                if (abs(x - min_x) < tolerance and abs(y - min_y) < tolerance) or \
                   (abs(x - max_x) < tolerance and abs(y - min_y) < tolerance) or \
                   (abs(x - min_x) < tolerance and abs(y - max_y) < tolerance) or \
                   (abs(x - max_x) < tolerance and abs(y - max_y) < tolerance):
                    if {'node': idx} not in all_full_fixed:
                        all_full_fixed.append({'node': idx})
                        print(f"Added FF corner node {idx}: ({x:.6f}, {y:.6f})")
    
    # Ensure we have enough boundary conditions
    if len(all_full_fixed) < 2:
        print("ERROR: Still insufficient boundary conditions!")
        # Add some boundary nodes as full fixed
        boundary_list = sorted(list(boundary_nodes))
        for i in range(min(3, len(boundary_list))):
            node_idx = boundary_list[i]
            if {'node': node_idx} not in all_full_fixed:
                all_full_fixed.append({'node': node_idx})
                print(f"Added FF boundary node {node_idx}")
    
    print(f"Final BC count: FF={len(all_full_fixed)}, NF={len(all_normal_fixed)}")
    
    # Remove duplicates
    all_normal_fixed = [dict(t) for t in {tuple(d.items()) for d in all_normal_fixed}]
    
    return {
        'full_fixed': all_full_fixed,
        'normal_fixed': all_normal_fixed
    }

# ✅ NEW: Sequential Analysis Endpoints

class SequentialAnalysisRequest(BaseModel):
    """Request model for sequential analysis"""
    stages: List[Dict[str, Any]]  # List of stage configurations
    continue_from_previous: bool = True  # Whether to continue from previous stage results

class SequentialAnalysisResponse(BaseModel):
    """Response model for sequential analysis"""
    success: bool
    message: str
    results: Dict[str, Any] = None  # Results for all stages
    stage_results: List[Dict[str, Any]] = None  # Individual stage results
    error: str = None

@app.post("/api/sequential/analyze", response_model=SequentialAnalysisResponse)
async def run_sequential_analysis(request: SequentialAnalysisRequest):
    """
    Run sequential analysis across multiple stages
    """
    try:
        print("🔧 SEQUENTIAL ANALYSIS REQUEST RECEIVED")
        print(f"📊 Number of stages: {len(request.stages)}")
        print(f"📊 Continue from previous: {request.continue_from_previous}")
        
        # Clear previous history if not continuing
        if not request.continue_from_previous:
            sequential_history.clear_history()
            print("🧹 Cleared previous sequential history")
        
        stage_results = []
        all_results = {
            'stages': [],
            'cumulative_data': {},
            'analysis_summary': {}
        }
        
        # Process each stage
        for stage_idx, stage_config in enumerate(request.stages):
            print(f"\n🔧 PROCESSING STAGE {stage_idx + 1}: {stage_config.get('stage_name', f'Stage {stage_idx + 1}')}")
            print("================================================")
            
            # Extract stage information
            stage_id = stage_config.get('stage_id', f'stage_{stage_idx + 1}')
            stage_name = stage_config.get('stage_name', f'Stage {stage_idx + 1}')
            stage_sequence = stage_config.get('stage_sequence', stage_idx + 1)
            is_initial_stage = stage_config.get('is_initial_stage', stage_idx == 0)
            calculation_type = stage_config.get('calculation_type', 'FEA')
            
            print(f"✅ Stage ID: {stage_id}")
            print(f"✅ Stage Name: {stage_name}")
            print(f"✅ Stage Sequence: {stage_sequence}")
            print(f"✅ Is Initial Stage: {is_initial_stage}")
            print(f"✅ Calculation Type: {calculation_type}")
            print("------------------------------------------------")
            
            # ✅ FIX: Get initial state from previous stage for non-initial stages (both FEA and K0)
            initial_state = None
            if not is_initial_stage:
                # Find previous stage by sequence number
                prev_stage_id = None
                for existing_stage_id, existing_stage_data in sequential_history.stages.items():
                    if existing_stage_data['stage_sequence'] == stage_sequence - 1:
                        prev_stage_id = existing_stage_id
                        break
                
                if prev_stage_id:
                    # Get initial state from previous stage
                    initial_state = sequential_history.get_initial_state_from_stage(prev_stage_id)
                    if initial_state:
                        print(f"✅ Initial state retrieved from previous stage: {prev_stage_id}")
                        print(f"   - Stress state: {len(initial_state['stress_state'])} elements")
                        print(f"   - Displacement state: {len(initial_state['displacement_state'])} nodes")
                        print(f"   - PWP state: {len(initial_state['pwp_state'])} nodes")
                        print(f"   - Plastic strain state: {len(initial_state['plastic_strain_state'])} elements")
                        
                        # ✅ DEBUG: Show first few stress values
                        stress_keys = list(initial_state['stress_state'].keys())[:5]
                        for key in stress_keys:
                            stress_data = initial_state['stress_state'][key]
                            print(f"   - Element {key}: σx={stress_data.get('total_stress_x', 0):.2f}, σy={stress_data.get('total_stress_y', 0):.2f} kPa")
                    else:
                        print(f"⚠️ No initial state available from previous stage: {prev_stage_id}")
                else:
                    print(f"⚠️ No previous stage found for sequence {stage_sequence - 1}")
            
            # ✅ NEW: Get element_active and previous_stage_active_elements from stage config
            element_active = stage_config.get('element_active', [])
            previous_stage_active_elements = stage_config.get('previous_stage_active_elements', [])
            
            print(f"✅ Element active status: {len(element_active)} elements")
            if element_active:
                active_count = sum(element_active)
                print(f"✅ Active elements: {active_count}/{len(element_active)}")
            else:
                print(f"ℹ️ No element_active provided (will use all active)")
            
            print(f"✅ Previous stage active elements: {len(previous_stage_active_elements)} elements")
            
            # Convert stage config to FEARequest format
            fea_request = FEARequest(
                nodes=stage_config['nodes'],
                elements=stage_config['elements'],
                boundaryConditionsFullFixed=stage_config['boundaryConditionsFullFixed'],
                boundaryConditionsNormalFixed=stage_config['boundaryConditionsNormalFixed'],
                loads=stage_config['loads'],
                pointLoads=stage_config.get('pointLoads', []),
                materials=stage_config['materials'],
                use_k0_procedure=(calculation_type == 'K0'),
                water_level=stage_config.get('water_level', 0.0),
                water_level_points=stage_config.get('water_level_points', []),
                interpolation_method=stage_config.get('interpolation_method', 'area_weighted'),
                stage_name=stage_name,
                stage_id=stage_id,
                active_polygons=stage_config.get('active_polygons', []),
                active_point_loads=stage_config.get('active_point_loads', []),
                active_water_levels=stage_config.get('active_water_levels', []),
                stage_sequence=stage_sequence,
                is_initial_stage=is_initial_stage,
                element_active=element_active,  # ✅ NEW: Pass element active status
                previous_stage_active_elements=previous_stage_active_elements  # ✅ NEW: Pass previous stage active elements
            )
            
            # ✅ NEW: Add initial state to FEA request for transfer conditions
            if initial_state:
                fea_request.initial_stress_state = initial_state['stress_state']
                fea_request.initial_displacement_state = initial_state['displacement_state']
                fea_request.initial_pwp_state = initial_state['pwp_state']
                fea_request.initial_plastic_strain_state = initial_state['plastic_strain_state']
                
                # ✅ NEW: Get previous stage active elements from initial state
                if 'element_active' in initial_state:
                    fea_request.previous_stage_active_elements = initial_state['element_active']
                    print(f"✅ Previous stage active elements from initial state: {len(fea_request.previous_stage_active_elements)} elements")
                else:
                    print(f"ℹ️ No element_active in initial state (using empty array)")
                    fea_request.previous_stage_active_elements = []
            
            # Run analysis for this stage
            print(f"🔧 Running {calculation_type} analysis for stage {stage_name}...")
            
            # For FEA stages, run both elastic and elasto-plastic analysis
            if calculation_type == 'FEA':
                # First run elastic FEA
                print(f"🔧 Running elastic FEA analysis...")
                elastic_response = await run_fea_analysis(fea_request)
                
                if not elastic_response.success:
                    error_msg = f"Elastic FEA analysis failed for stage {stage_name}: {elastic_response.error}"
                    print(f"❌ {error_msg}")
                    return SequentialAnalysisResponse(
                        success=False,
                        message=error_msg,
                        error=elastic_response.error
                    )
                
                # Then run elasto-plastic analysis
                print(f"🔧 Running elasto-plastic analysis...")
                print(f"🔧 DEBUG: About to call run_elasto_plastic_analysis()")
                elasto_plastic_response = await run_elasto_plastic_analysis(fea_request)
                print(f"🔧 DEBUG: Successfully called run_elasto_plastic_analysis()")
                
                if not elasto_plastic_response.success:
                    print(f"⚠️ Elasto-plastic analysis failed, using elastic results only: {elasto_plastic_response.error}")
                    stage_response = elastic_response
                else:
                    # Combine elastic and plastic results
                    print(f"✅ Combining elastic and plastic results...")
                    elastic_results = elastic_response.results
                    plastic_results = elasto_plastic_response.results
                    
                    # Merge results
                    combined_results = elastic_results.copy()
                    if 'plastic_analysis' in plastic_results:
                        combined_results['plastic_analysis'] = plastic_results['plastic_analysis']
                    if 'plastic_strain_history' in plastic_results:
                        combined_results['plastic_strain_history'] = plastic_results['plastic_strain_history']
                    
                    # ✅ FIX: Use soil_results from elasto-plastic analysis (not elastic)
                    if 'soil_results' in plastic_results:
                        combined_results['soil_results'] = plastic_results['soil_results']
                        print(f"✅ Using soil_results from elasto-plastic analysis")
                    elif 'soil_results' in elastic_results:
                        combined_results['soil_results'] = elastic_results['soil_results']
                        print(f"⚠️ Using soil_results from elastic analysis (fallback)")
                    else:
                        print(f"❌ No soil_results found in either analysis")
                    
                    stage_response = FEAResponse(
                        success=True,
                        message="Combined elastic and elasto-plastic analysis completed",
                        results=combined_results
                    )
            else:
                # For K0 stages, run normal analysis
                stage_response = await run_fea_analysis(fea_request)
            
            if not stage_response.success:
                error_msg = f"Stage {stage_name} analysis failed: {stage_response.error}"
                print(f"❌ {error_msg}")
                return SequentialAnalysisResponse(
                    success=False,
                    message=error_msg,
                    error=stage_response.error
                )
            
            # Extract results for sequential history
            results = stage_response.results
            
            # ✅ DEBUG: Show what's in results
            print(f"🔧 DEBUG: Results keys: {list(results.keys())}")
            print(f"🔧 DEBUG: Results has soil_results: {'soil_results' in results}")
            
            # Prepare data for SequentialHistory
            element_results = []
            for i, elem_result in enumerate(results.get('element_results', [])):
                # ✅ FIX: Use element_index consistently (both K0 and FEA use element_index)
                element_index = elem_result.get('element_index', i)
                element_results.append({
                    'element_index': element_index,  # ✅ Use element_index consistently
                    'total_stress_x': elem_result.get('total_stress_x', 0.0),
                    'total_stress_y': elem_result.get('total_stress_y', 0.0),
                    'effective_stress_x': elem_result.get('effective_stress_x', 0.0),
                    'effective_stress_y': elem_result.get('effective_stress_y', 0.0),
                    'effective_principal_stress_1': elem_result.get('effective_principal_stress_1', 0.0),
                    'effective_principal_stress_3': elem_result.get('effective_principal_stress_3', 0.0),
                    'principal_stresses': elem_result.get('principal_stresses', [0.0, 0.0]),
                    'pore_water_pressure': elem_result.get('pore_water_pressure', 0.0)
                })
            
            nodal_displacements = results.get('nodal_displacements', [])
            nodal_stress_strain = results.get('nodal_stress_strain', [])
            soil_results = results.get('soil_results', {})
            
            # ✅ DEBUG: Show soil_results content
            print(f"🔧 DEBUG: Soil results from stage_response:")
            print(f"   - max_total_stress_x: {soil_results.get('max_total_stress_x', 'NOT_FOUND')}")
            print(f"   - min_total_stress_x: {soil_results.get('min_total_stress_x', 'NOT_FOUND')}")
            print(f"   - max_total_stress_y: {soil_results.get('max_total_stress_y', 'NOT_FOUND')}")
            print(f"   - min_total_stress_y: {soil_results.get('min_total_stress_y', 'NOT_FOUND')}")
            
            # Get PWP history from stage results if available
            pwp_history = {}
            if 'pwp_history' in results:
                pwp_history = results.get('pwp_history', {})
            
            # ✅ NEW: Get yield check data from stage results if available
            yield_check_data = None
            if 'yield_check_results' in results:
                yield_check_data = results.get('yield_check_results', {})
            elif 'summary' in results and 'yield_check' in results['summary']:
                yield_check_data = results['summary']['yield_check']
            
            # ✅ FIX: Use yield_check_data as plastic_strain_data for K0 stages
            if yield_check_data and calculation_type == 'K0':
                # Convert yield_check_data to plastic_strain_data format
                plastic_strain_data = {
                    'total_elements': yield_check_data.get('total_elements', len(element_results) if element_results else 0),
                    'yielded_elements': yield_check_data.get('yielded_elements', 0),
                    'yielded_elements_list': yield_check_data.get('yielded_elements_list', []),
                    'plastic_strain_history': {},  # K0 doesn't have plastic strain
                    'accumulated_plastic_strain_history': {},  # K0 doesn't have plastic strain
                    'iteration_history': [],  # K0 doesn't have iterations
                    'max_plastic_strain_magnitude': 0.0,  # K0 doesn't have plastic strain
                    'max_accumulated_plastic_strain': 0.0  # K0 doesn't have plastic strain
                }
            
            # ✅ NEW: Get plastic strain data from stage results if available
            plastic_strain_data = None
            if 'plastic_analysis' in results:
                plastic_strain_data = results.get('plastic_analysis', {})
                # Add total_elements if missing
                if 'total_elements' not in plastic_strain_data:
                    plastic_strain_data['total_elements'] = len(element_results) if element_results else 0
            elif 'plastic_strain_history' in results:
                plastic_strain_data = {
                    'plastic_strain_history': results.get('plastic_strain_history', {}),
                    'accumulated_plastic_strain': results.get('accumulated_plastic_strain', {}),
                    'yielded_elements': results.get('yielded_elements', []),
                    'iteration_history': results.get('iteration_history', []),
                    'total_elements': len(element_results) if element_results else 0
                }
            
            # ✅ DEBUG: Show soil_results before adding to sequential history
            print(f"🔧 DEBUG: Soil results for stage {stage_name}:")
            print(f"   - max_total_stress_x: {soil_results.get('max_total_stress_x', 'NOT_FOUND')}")
            print(f"   - min_total_stress_x: {soil_results.get('min_total_stress_x', 'NOT_FOUND')}")
            print(f"   - max_total_stress_y: {soil_results.get('max_total_stress_y', 'NOT_FOUND')}")
            print(f"   - min_total_stress_y: {soil_results.get('min_total_stress_y', 'NOT_FOUND')}")
            
            # Add stage data to SequentialHistory
            sequential_history.add_stage_data(
                stage_id=stage_id,
                stage_name=stage_name,
                stage_sequence=stage_sequence,
                calculation_type=calculation_type,
                is_initial_stage=is_initial_stage,
                element_results=element_results,
                nodal_displacements=nodal_displacements,
                nodal_stress_strain=nodal_stress_strain,
                soil_results=soil_results,
                pwp_history=pwp_history,
                plastic_strain_data=plastic_strain_data,  # ✅ NEW: Add plastic strain data
                yield_check_data=yield_check_data,  # ✅ NEW: Add yield check data
                element_active=element_active  # ✅ NEW: Add element active status
            )
            
            print(f"✅ Stage {stage_name} data added to sequential history")
            print("------------------------------------------------")
            # Store stage result with frontend-compatible format
            stage_result = {
                'stage_id': stage_id,  # ✅ Back to snake_case (frontend now matches)
                'stage_name': stage_name,  # ✅ Back to snake_case (frontend now matches)
                'stage_sequence': stage_sequence,
                'calculation_type': calculation_type,
                'is_initial_stage': is_initial_stage,
                'results': results,
                'success': True,
                # Add frontend-expected properties
                'activePolygons': len(stage_config.get('active_polygons', [])),
                'activePointLoads': len(stage_config.get('active_point_loads', [])),
                'activeWaterLevels': len(stage_config.get('active_water_levels', [])),
                'waterLevel': stage_config.get('water_level', 0.0)
            }
            stage_results.append(stage_result)
            all_results['stages'].append(stage_result)
        
        # Calculate cumulative data across all stages
        print("\n🔧 Calculating cumulative data across all stages...")
        sequential_history.calculate_cumulative_data()
        print("------------------------------------------------")
        # Get sequential history summary
        history_summary = sequential_history.get_all_stages_summary()
        
        # Convert all data to Python native types for JSON serialization
        all_results = convert_numpy_to_python(all_results)
        stage_results = convert_numpy_to_python(stage_results)
        history_summary = convert_numpy_to_python(history_summary)
        
        all_results['cumulative_data'] = history_summary
        all_results['analysis_summary'] = {
            'total_stages': len(stage_results),
            'initial_stage_type': stage_results[0]['calculation_type'] if stage_results else 'N/A',
            'final_stage_type': stage_results[-1]['calculation_type'] if stage_results else 'N/A',
            'analysis_completed': True
        }
        print(f"✅ Sequential analysis completed successfully!")
        print(f"📊 Total stages processed: {len(stage_results)}")
        print(f"📊 History summary: {history_summary['total_stages']} stages in history")
        print("------------------------------------------------")
        
        return SequentialAnalysisResponse(
            success=True,
            message=f"Sequential analysis completed successfully for {len(stage_results)} stages",
            results=all_results,
            stage_results=stage_results
        )
        
    except Exception as e:
        print(f"❌ Error in sequential analysis: {e}")
        import traceback
        traceback.print_exc()
        return SequentialAnalysisResponse(
            success=False,
            message="Sequential analysis failed",
            error=str(e)
        )

@app.get("/api/sequential/history")
async def get_sequential_history():
    """
    Get the current sequential analysis history
    """
    try:
        history_summary = sequential_history.get_all_stages_summary()
        return {
            "success": True,
            "history": history_summary,
            "total_stages": history_summary['total_stages']
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.delete("/api/sequential/history")
async def clear_sequential_history():
    """
    Clear the sequential analysis history
    """
    try:
        sequential_history.clear_history()
        return {
            "success": True,
            "message": "Sequential history cleared successfully"
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/sequential/stage/{stage_id}")
async def get_stage_results(stage_id: str):
    """
    Get results for a specific stage
    """
    try:
        print(f"🔧 Getting stage results for stage_id: {stage_id}")
        stage_results = sequential_history.get_stage_results(stage_id)
        if stage_results:
            # ✅ DEBUG: Show summary data if available
            if 'summary' in stage_results:
                summary = stage_results['summary']
                print(f"🔧 Stage {stage_id} summary data:")
                print(f"   - max_total_stress_x: {summary.get('max_total_stress_x', 'NOT_FOUND')}")
                print(f"   - min_total_stress_x: {summary.get('min_total_stress_x', 'NOT_FOUND')}")
                print(f"   - max_total_stress_y: {summary.get('max_total_stress_y', 'NOT_FOUND')}")
                print(f"   - min_total_stress_y: {summary.get('min_total_stress_y', 'NOT_FOUND')}")
            else:
                print(f"⚠️ Stage {stage_id} has no summary data")
            
            # ✅ DEBUG: Show soil_results data if available
            if 'soil_results' in stage_results:
                soil_results = stage_results['soil_results']
                print(f"🔧 Stage {stage_id} soil_results data:")
                print(f"   - max_total_stress_x: {soil_results.get('max_total_stress_x', 'NOT_FOUND')}")
                print(f"   - min_total_stress_x: {soil_results.get('min_total_stress_x', 'NOT_FOUND')}")
                print(f"   - max_total_stress_y: {soil_results.get('max_total_stress_y', 'NOT_FOUND')}")
                print(f"   - min_total_stress_y: {soil_results.get('min_total_stress_y', 'NOT_FOUND')}")
            else:
                print(f"⚠️ Stage {stage_id} has no soil_results data")
            
            return {
                "success": True,
                "stage_results": stage_results
            }
        else:
            print(f"❌ Stage {stage_id} not found in sequential history")
            return {
                "success": False,
                "error": f"Stage {stage_id} not found"
            }
    except Exception as e:
        print(f"❌ Error getting stage results for {stage_id}: {e}")
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/fea/elasto-plastic", response_model=FEAResponse)
async def run_elasto_plastic_analysis(request: FEARequest):
    """
    Run elasto-plastic FEA analysis with return mapping algorithm for Mohr-Coulomb materials
    """
    try:
        print(f"🔧 Elasto-plastic FEA analysis request received for stage: {request.stage_name}")
        
        # Convert request data to internal format
        nodes = [(node.x, node.y) for node in request.nodes]
        elements = [(elem.node1, elem.node2, elem.node3) for elem in request.elements]
        
        # Create geometry object - use same format as run_fea_analysis
        geometry = Geometry()
        geometry.nodes = np.array(nodes)
        geometry.elements = np.array(elements) - 1  # Convert to 0-based indexing
        geometry.num_nodes = len(geometry.nodes)
        geometry.num_elements = len(geometry.elements)
        
        # ✅ NEW: Set element active status (same as run_fea_analysis)
        if request.element_active:
            geometry.element_active = np.array(request.element_active, dtype=bool)
            print(f"✅ Elasto-plastic: Using provided element_active array: {len(geometry.element_active)} elements")
            print(f"✅ Elasto-plastic: Active elements: {np.sum(geometry.element_active)}")
        else:
            geometry.element_active = np.ones(geometry.num_elements, dtype=bool)
            print(f"✅ Elasto-plastic: Using default element_active (all active): {geometry.num_elements} elements")
        
        # Create boundary conditions
        boundary_conditions = BoundaryConditions()
        
        # Add full fixed boundary conditions
        for bc in request.boundaryConditionsFullFixed:
            boundary_conditions.add_full_fixed(bc.node)
        
        # Add normal fixed boundary conditions
        for bc in request.boundaryConditionsNormalFixed:
            boundary_conditions.add_normal_fixed(bc.node)
        
        # Add loads
        for load in request.loads:
            boundary_conditions.add_load(load.node, load.fx, load.fy)
        
        # Convert materials to internal format - use same format as run_fea_analysis
        element_materials = []
        print(f"🔧 Processing {len(request.elements)} elements for elasto-plastic analysis")
        print(f"🔧 Available materials: {len(request.materials)}")
        
        for i, element in enumerate(request.elements):
            # Find material for this element
            element_material = None
            for mat_data in request.materials:
                if mat_data.element_id == element.id:  # Use element.id directly (same as run_fea_analysis)
                    element_material = {
                        'youngsModulus': mat_data.material.youngsModulus,
                        'poissonsRatio': mat_data.material.poissonsRatio,
                        'unitWeightSaturated': mat_data.material.unitWeightSaturated,
                        'unitWeightUnsaturated': mat_data.material.unitWeightUnsaturated,
                        'cohesion': mat_data.material.cohesion,
                        'frictionAngle': mat_data.material.frictionAngle,
                        'dilationAngle': mat_data.material.dilationAngle,
                        'thickness': mat_data.material.thickness,
                        'permeability': mat_data.material.permeability,
                        'voidRatio': mat_data.material.voidRatio,
                        'specificGravity': mat_data.material.specificGravity
                    }
                    break
            
            # Validate material assignment
            if not element_material:
                print(f"❌ Element {i} (ID: {element.id}) has no material assigned!")
                print(f"❌ Available material element_ids: {[mat.element_id for mat in request.materials]}")
                raise ValueError(f"Element {i} (ID: {element.id}) has no material assigned. Please assign material to all polygons before running analysis.")
            
            element_materials.append({
                'element_id': i,  # ✅ Use enumerate index for consistent material assignment
                'material': element_material
            })
        
        print(f"✅ Elasto-plastic element materials: {len(element_materials)} material assignments")
        
        # ✅ NEW: Prepare previous_stage_active_elements for FEASolver (same as run_fea_analysis)
        previous_stage_active_elements = None
        if request.previous_stage_active_elements:
            previous_stage_active_elements = np.array(request.previous_stage_active_elements, dtype=bool)
            print(f"✅ Elasto-plastic: Using previous_stage_active_elements: {len(previous_stage_active_elements)} elements")
        else:
            print(f"ℹ️ Elasto-plastic: No previous_stage_active_elements provided")
        
        # Create FEA solver with elasto-plastic capabilities
        solver = FEASolver(
            geometry=geometry,
            element_materials=element_materials,
            boundary_conditions=boundary_conditions,
            water_level=request.water_level,
            water_level_points=request.water_level_points,
            is_initial_stage=request.is_initial_stage,
            initial_stress_state=request.initial_stress_state,
            initial_displacement_state=request.initial_displacement_state,
            initial_pwp_state=request.initial_pwp_state,
            initial_plastic_strain_state=request.initial_plastic_strain_state,
            previous_stage_active_elements=previous_stage_active_elements  # ✅ NEW: Pass active elements
        )
        
        # ✅ Run elasto-plastic analysis
        print(f"🔧 DEBUG: About to call solver.solve_elasto_plastic()")
        converged, convergence_info = solver.solve_elasto_plastic()
        print(f"🔧 DEBUG: Successfully called solver.solve_elasto_plastic()")
        
        # Get comprehensive results
        print(f"🔧 DEBUG: About to call solver.get_elasto_plastic_results()")
        results = solver.get_elasto_plastic_results()
        print(f"🔧 DEBUG: Successfully called solver.get_elasto_plastic_results()")
        
        # ✅ PATCH: Copy 'elastic_results' to 'element_results' for frontend compatibility
        if 'elastic_results' in results:
            results['element_results'] = results['elastic_results']

        # Get nodal displacements
        nodal_displacements = solver.get_nodal_displacements()
        
        # Get active nodes for this stage
        active_nodes = solver.get_active_nodes()
        
        # ✅ FIX: Get soil-specific results (including total stress values)
        print("Getting soil-specific results for elasto-plastic analysis...")
        print(f"🔧 DEBUG: About to call solver.get_soil_specific_results()")
        try:
            soil_results = solver.get_soil_specific_results()
            print(f"🔧 DEBUG: Successfully called solver.get_soil_specific_results()")
            print(f"🔧 Elasto-plastic soil results:")
            print(f"   - max_total_stress_x: {soil_results.get('max_total_stress_x', 'NOT_FOUND')}")
            print(f"   - min_total_stress_x: {soil_results.get('min_total_stress_x', 'NOT_FOUND')}")
            print(f"   - max_total_stress_y: {soil_results.get('max_total_stress_y', 'NOT_FOUND')}")
            print(f"   - min_total_stress_y: {soil_results.get('min_total_stress_y', 'NOT_FOUND')}")
        except Exception as e:
            print(f"❌ Error calling get_soil_specific_results(): {e}")
            print(f"❌ Traceback: {traceback.format_exc()}")
            # Create default soil_results
            soil_results = {
                'max_total_stress_x': 0.0,
                'min_total_stress_x': 0.0,
                'max_total_stress_y': 0.0,
                'min_total_stress_y': 0.0,
                'max_effective_principal_stress_1': 0.0,
                'min_effective_principal_stress_1': 0.0,
                'max_pore_water_pressure': 0.0,
                'min_pore_water_pressure': 0.0
            }
        
        # Calculate summary statistics
        if len(nodal_displacements) > 0:
            # Extract displacement magnitudes from dictionaries
            displacement_magnitudes = [disp['magnitude'] for disp in nodal_displacements]
            max_displacement = max(displacement_magnitudes) if displacement_magnitudes else 0.0
            min_displacement = min(displacement_magnitudes) if displacement_magnitudes else 0.0
            
            # Calculate max settlement (vertical displacement)
            vertical_displacements = [disp['v'] for disp in nodal_displacements]
            max_settlement = abs(min(vertical_displacements)) if vertical_displacements else 0.0
        else:
            max_displacement = 0.0
            min_displacement = 0.0
            max_settlement = 0.0
        
        # Get plastic analysis summary
        plastic_summary = solver.get_plastic_analysis_summary()
        
        # Convert results to Python native types for JSON serialization
        results = convert_numpy_to_python(results)
        nodal_displacements = convert_numpy_to_python(nodal_displacements)
        active_nodes = convert_numpy_to_python(active_nodes)
        soil_results = convert_numpy_to_python(soil_results)
        
        # Create response
        response_data = {
            'displacements': nodal_displacements,
            'results': results,
            'active_nodes': active_nodes,
            'soil_results': soil_results,  # ✅ FIX: Add soil_results to response
            'summary': {
                'max_displacement': float(max_displacement),
                'min_displacement': float(min_displacement),
                'max_settlement': float(max_settlement),
                'total_elements': len(solver.elements),
                'yielded_elements': plastic_summary['total_yielded_elements'],
                'convergence_rate': plastic_summary['convergence_rate'],
                'average_iterations': plastic_summary['average_iterations'],
                # ✅ FIX: Add total stress values to summary
                'max_total_stress_x': soil_results.get('max_total_stress_x', 0.0),
                'min_total_stress_x': soil_results.get('min_total_stress_x', 0.0),
                'max_total_stress_y': soil_results.get('max_total_stress_y', 0.0),
                'min_total_stress_y': soil_results.get('min_total_stress_y', 0.0),
                'max_effective_principal_stress_1': soil_results.get('max_effective_principal_stress_1', 0.0),
                'min_effective_principal_stress_1': soil_results.get('min_effective_principal_stress_1', 0.0),
                'max_pore_water_pressure': soil_results.get('max_pore_water_pressure', 0.0),
                'min_pore_water_pressure': soil_results.get('min_pore_water_pressure', 0.0)
            },
            'plastic_analysis': {
                'converged': convergence_info['converged'],
                'total_iterations': plastic_summary['total_iterations'],
                'yielded_elements': plastic_summary['yielded_elements'],
                'yielded_elements_list': plastic_summary['yielded_elements_list'],
                'convergence_rate': plastic_summary['convergence_rate'],
                'max_yield_function_abs': plastic_summary['max_yield_function_abs'],
                'avg_yield_function_abs': plastic_summary['avg_yield_function_abs'],
                'total_elements': plastic_summary['total_elements']
            }
        }
        
        print(f"✅ Elasto-plastic analysis completed successfully")
        print(f"   - Max displacement: {max_displacement:.6f} m")
        print(f"   - Max settlement: {max_settlement:.6f} m")
        print(f"   - Yielded elements: {plastic_summary['total_yielded_elements']}/{len(solver.elements)}")
        print(f"   - Convergence: {convergence_info['converged']}")
        
        return FEAResponse(
            success=True,
            message=f"Elasto-plastic analysis completed successfully. {plastic_summary['total_yielded_elements']} elements yielded.",
            results=response_data
        )
        
    except Exception as e:
        error_msg = f"Elasto-plastic analysis failed: {str(e)}"
        print(f"❌ {error_msg}")
        print(f"Traceback: {traceback.format_exc()}")
        
        return FEAResponse(
            success=False,
            message=error_msg,
            error=str(e)
        )

# Tambahkan ini di akhir file
if __name__ == "__main__":
    import uvicorn
    print("Starting TerraSim FEA API server...")
    print(f"Server will run on port {PORT}")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
 