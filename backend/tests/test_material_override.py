
import asyncio
import numpy as np
from uuid import uuid4
from backend.models import (
    MeshResponse, PolygonData, Point, Material, 
    SolverRequest, PhaseRequest, PhaseType,
    BoundaryConditionsResponse, BoundaryCondition,
    ElementMaterial,
    MaterialModel, DrainageType
)
from backend.solver import solve_phases
from backend.mesh_generator import generate_mesh

def create_mock_mesh():
    # 1. Define Geometry (Single rectangle 2x2)
    # Polygon 0: (0,0) to (2,2)
    poly = PolygonData(
        vertices=[Point(x=0,y=0), Point(x=2, y=0), Point(x=2, y=2), Point(x=0, y=2)],
        materialId="mat_soft",
        mesh_size=1.0
    )
    
    # 2. Define Initial Material (Soft)
    mat_soft = Material(
        id="mat_soft", name="Soft Clay", color="red",
        youngsModulus=1000.0, effyoungsModulus=1000.0, poissonsRatio=0.3,
        unitWeightUnsaturated=18.0, unitWeightSaturated=20.0, 
        material_model=MaterialModel.LINEAR_ELASTIC,
        cohesion=10.0, frictionAngle=0.0, drainage_type=DrainageType.UNDRAINED_B
    )
    
    # 3. Create Mesh
    # We'll mock the mesh directly to avoid running `generate_mesh` if environment is tricky,
    # but `generate_mesh` is pure python usually (if using triangle, it might fail).
    # Let's try to mock the MeshResponse manually to be safe and independent of mesh engine.
    
    nodes = [
        [0.0, 0.0], [2.0, 0.0], [2.0, 2.0], [0.0, 2.0], # Corners
        [1.0, 0.0], [2.0, 1.0], [1.0, 2.0], [0.0, 1.0], # Mids
        [1.0, 1.0] # Center
    ]
    # 2 Triangles (Elements) (T6) 
    # T1: 0-1-2-4-5-8 ? No, let's keep it simple.
    # Actually, let's assume `generate_mesh` works or we use a very simple manual structure.
    # Manual: 1 square element made of 2 triangles.
    # Node indices: 0(0,0), 1(2,0), 2(2,2), 3(0,2)
    # + mids: 4(1,0), 5(2,1), 6(1,2), 7(0,1)
    # + center: 8(1,1) is not created by boundary.
    # T1: 0, 1, 3 + mids 4, ??, 7.
    # This is tedious. Let's try to rely on generate_mesh first, if it fails we mock.
    pass

async def test_override():
    print("--- Test Material Override Config (3 Phases) ---")
    
    # Define Materials
    mat_1 = Material(
        id="mat_1", name="Material Phase 1", color="#ff0000",
        youngsModulus=1000.0, effyoungsModulus=1000.0, poissonsRatio=0.3,
        unitWeightUnsaturated=18.0, unitWeightSaturated=20.0, cohesion=5.0, frictionAngle=0.0,
        k0_x=0.5, k0_z=0.5
    )
    
    mat_2 = Material(
        id="mat_2", name="Material Phase 2", color="#00ff00",
        youngsModulus=5000.0, effyoungsModulus=5000.0, poissonsRatio=0.3, # Stiffer
        unitWeightUnsaturated=19.0, unitWeightSaturated=21.0, cohesion=10.0, frictionAngle=20.0
    )

    mat_3 = Material(
        id="mat_3", name="Material Phase 3", color="#0000ff",
        youngsModulus=20000.0, effyoungsModulus=20000.0, poissonsRatio=0.3, # Even Stiffer
        unitWeightUnsaturated=20.0, unitWeightSaturated=22.0, cohesion=20.0, frictionAngle=30.0
    )
    
    # 1. Generate Mesh
    nodes = [
        [0.0, 0.0], [2.0, 0.0], [0.0, 2.0], 
        [1.0, 0.0], [1.0, 1.0], [0.0, 1.0]  
    ]
    elements = [[0, 1, 2, 3, 4, 5]]
    
    mesh = MeshResponse(
        success=True,
        nodes=nodes,
        elements=elements,
        boundary_conditions=BoundaryConditionsResponse(full_fixed=[BoundaryCondition(node=0), BoundaryCondition(node=1)], normal_fixed=[]),
        point_load_assignments=[],
        line_load_assignments=[],
        element_materials=[ElementMaterial(
            element_id=1,
            material=mat_1, # Start with Mat 1
            polygon_id=0
        )],
        error=None
    )
    
    # 2. Setup Solver Request
    
    # Phase 1: K0 Procedure (Material 1)
    phase1 = PhaseRequest(
        id="phase1", name="Step 1: K0",
        phase_type=PhaseType.K0_PROCEDURE,
        active_polygon_indices=[0],
        active_load_ids=[],
        reset_displacements=True
    )
    
    # Phase 2: Material Change (Mat 1 -> Mat 2) + Load
    phase2 = PhaseRequest(
        id="phase2", name="Step 2: Change to Mat 2",
        phase_type=PhaseType.PLASTIC,
        parent_id="phase1",
        active_polygon_indices=[0],
        active_load_ids=["load1"],
        material_overrides={0: "mat_2"} 
    )

    # Phase 3: Material Change (Mat 2 -> Mat 3) + More Load
    phase3 = PhaseRequest(
        id="phase3", name="Step 3: Change to Mat 3",
        phase_type=PhaseType.PLASTIC,
        parent_id="phase2",
        active_polygon_indices=[0],
        active_load_ids=["load1"], 
        material_overrides={0: "mat_3"}
    )

    # Phase 4: No Material Override (Should revert to Mat 1)
    phase4 = PhaseRequest(
        id="phase4", name="Step 4: No Override (Revert to Mat 1)",
        phase_type=PhaseType.PLASTIC,
        parent_id="phase3",
        active_polygon_indices=[0],
        active_load_ids=["load1"],
        material_overrides={} # No override, should revert to base material for polygon 0
    )
    
    from backend.models import PointLoad
    pl = PointLoad(id="load1", x=0, y=2, fx=0, fy=-100, node=2)
    
    req = SolverRequest(
        mesh=mesh,
        phases=[phase1, phase2, phase3, phase4],
        point_loads=[pl],
        materials=[mat_1, mat_2, mat_3]
    )
    
    print("Running Solver...")
    logs = []
    gen = solve_phases(req)
    
    try:
        found_override_2 = False
        found_override_3 = False
        found_reset_to_original = False
        
        for item in gen:
            if item['type'] == 'log':
                msg = item['content']
                print(f"[LOG] {msg}")
                logs.append(msg)
                if "Overriding material for Polygon 0: New Material 'Material Phase 2'" in msg:
                    found_override_2 = True
                if "Overriding material for Polygon 0: New Material 'Material Phase 3'" in msg:
                    found_override_3 = True
                if "Reset 1 elements to original material." in msg:
                    found_reset_to_original = True

            elif item['type'] == 'phase_result':
                res = item['content']
                print(f"[RESULT] Phase {res['phase_id']} Success: {res['success']}")
    except Exception as e:
        print(f"Solver crashed: {e}")
        raise e

    # Verification
    assert found_override_2, "Phase 2 override not found!"
    assert found_override_3, "Phase 3 override not found!"
    assert found_reset_to_original, "Phase 4 reset to original material not found!"
    print("\n✅ TEST PASSED: 4 Phases verified (Overrides applied and Reset worked).")

if __name__ == "__main__":
    asyncio.run(test_override())
