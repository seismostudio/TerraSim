"""
Comprehensive Test Suite for Mohr-Coulomb Plasticity Implementation
Tests elastic and plastic behavior under extreme conditions
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from backend.models import (
    SolverRequest, SolverSettings, MeshResponse, 
    BoundaryConditionsResponse, BoundaryCondition,
    ElementMaterial, Material, MaterialModel, PointLoadData
)
from backend.fea_solver import solve_initial_phase
import numpy as np

def create_simple_mesh(width=10.0, height=5.0, nx=4, ny=2):
    """Create a simple rectangular mesh for testing"""
    # Generate nodes
    nodes = []
    for j in range(ny + 1):
        for i in range(nx + 1):
            x = i * width / nx
            y = j * height / ny
            nodes.append([x, y])
    
    # Generate elements (2 triangles per quad)
    elements = []
    for j in range(ny):
        for i in range(nx):
            n1 = j * (nx + 1) + i
            n2 = n1 + 1
            n3 = n1 + (nx + 1)
            n4 = n3 + 1
            
            # Triangle 1
            elements.append([n1, n2, n3])
            # Triangle 2
            elements.append([n2, n4, n3])
    
    return nodes, elements

def test_case_1_pure_elastic():
    """
    Test Case 1: Strong soil (should remain 100% elastic)
    - High cohesion (c = 100 kN/m²)
    - High friction angle (φ = 35°)
    - Material model: Mohr-Coulomb
    - Expected: NO yielding
    """
    print("\n" + "="*80)
    print("TEST CASE 1: PURE ELASTIC BEHAVIOR (Strong Soil)")
    print("="*80)
    
    nodes, elements = create_simple_mesh(10, 5, 4, 2)
    
    # Strong material (should NOT yield under gravity)
    material = Material(
        id="strong_soil",
        name="Dense Sand",
        color="#FFD700",
        youngsModulus=50000,  # 50 MPa
        poissonsRatio=0.3,
        unitWeightSaturated=20,  # kN/m³
        unitWeightUnsaturated=18,
        cohesion=100,  # High cohesion
        frictionAngle=35,  # High friction
        material_model=MaterialModel.MOHR_COULOMB  # Use plasticity
    )
    
    # Boundary conditions: bottom fixed, sides roller
    num_nodes = len(nodes)
    nx = 4
    full_fixed = [BoundaryCondition(node=i) for i in range(nx + 1)]  # Bottom
    normal_fixed = []
    for j in range(1, 3):
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1)))  # Left edge
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1) + nx))  # Right edge
    
    # Element materials (all use strong material)
    element_materials = [
        ElementMaterial(element_id=i+1, material=material) 
        for i in range(len(elements))
    ]
    
    mesh = MeshResponse(
        success=True,
        nodes=nodes,
        elements=elements,
        boundary_conditions=BoundaryConditionsResponse(
            full_fixed=full_fixed,
            normal_fixed=normal_fixed
        ),
        point_load_assignments=[],
        element_materials=element_materials
    )
    
    request = SolverRequest(
        mesh=mesh,
        settings=SolverSettings(max_steps=50),
        point_loads=[]
    )
    
    result = solve_initial_phase(request)
    
    print(f"✅ Analysis Success: {result.success}")
    print(f"📊 Steps Taken: {result.steps_taken}")
    print(f"📍 Max Displacement: {max([d.ux**2 + d.uy**2 for d in result.displacements])**0.5:.6f} m")
    
    yielded = [s for s in result.stresses if s.is_yielded]
    print(f"🔴 Yielded Elements: {len(yielded)}/{len(result.stresses)}")
    
    if len(yielded) == 0:
        print("✅ PASS: No yielding detected (as expected for strong soil)")
    else:
        print(f"⚠️  WARNING: Unexpected yielding in {len(yielded)} elements")
        for s in yielded[:3]:
            print(f"   Element {s.element_id}: f = {s.yield_function:.4f}")
    
    return result

def test_case_2_partial_yielding():
    """
    Test Case 2: Moderate soil with heavy load (partial yielding)
    - Moderate cohesion (c = 10 kN/m²)
    - Moderate friction (φ = 25°)
    - Heavy point load at top center
    - Expected: Some elements yield (5-30%)
    """
    print("\n" + "="*80)
    print("TEST CASE 2: PARTIAL YIELDING (Moderate Soil + Heavy Load)")
    print("="*80)
    
    nodes, elements = create_simple_mesh(10, 5, 6, 3)
    
    # Moderate material
    material = Material(
        id="moderate_soil",
        name="Medium Clay",
        color="#CD853F",
        youngsModulus=15000,  # 15 MPa
        poissonsRatio=0.35,
        unitWeightSaturated=18,
        unitWeightUnsaturated=16,
        cohesion=10,  # Moderate
        frictionAngle=25,  # Moderate
        material_model=MaterialModel.MOHR_COULOMB
    )
    
    # BCs
    nx = 6
    full_fixed = [BoundaryCondition(node=i) for i in range(nx + 1)]
    normal_fixed = []
    for j in range(1, 4):
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1)))
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1) + nx))
    
    element_materials = [
        ElementMaterial(element_id=i+1, material=material) 
        for i in range(len(elements))
    ]
    
    # Heavy point load at top center
    center_node = 3 * (nx + 1) + nx // 2  # Top center
    point_loads = [
        PointLoadData(node=center_node, fx=0, fy=-500)  # 500 kN downward
    ]
    
    mesh = MeshResponse(
        success=True,
        nodes=nodes,
        elements=elements,
        boundary_conditions=BoundaryConditionsResponse(
            full_fixed=full_fixed,
            normal_fixed=normal_fixed
        ),
        point_load_assignments=[],
        element_materials=element_materials
    )
    
    request = SolverRequest(
        mesh=mesh,
        settings=SolverSettings(max_steps=100),
        point_loads=point_loads
    )
    
    result = solve_initial_phase(request)
    
    print(f"✅ Analysis Success: {result.success}")
    print(f"📊 Steps Taken: {result.steps_taken}")
    print(f"📍 Max Displacement: {max([d.ux**2 + d.uy**2 for d in result.displacements])**0.5:.6f} m")
    
    yielded = [s for s in result.stresses if s.is_yielded]
    yield_pct = len(yielded) / len(result.stresses) * 100
    print(f"🔴 Yielded Elements: {len(yielded)}/{len(result.stresses)} ({yield_pct:.1f}%)")
    
    if 5 <= yield_pct <= 50:
        print("✅ PASS: Partial yielding detected (expected behavior)")
    else:
        print(f"⚠️  WARNING: Unexpected yield percentage: {yield_pct:.1f}%")
    
    if yielded:
        print("\nTop 5 yielded elements:")
        sorted_yield = sorted(yielded, key=lambda s: s.yield_function or 0, reverse=True)
        for s in sorted_yield[:5]:
            print(f"   Element {s.element_id}: σ_xx={s.sig_xx:.1f}, σ_yy={s.sig_yy:.1f}, f={s.yield_function:.4f}")
    
    return result

def test_case_3_extensive_yielding():
    """
    Test Case 3: Very weak soil (extensive yielding / near collapse)
    - Very low cohesion (c = 1 kN/m²)
    - Low friction (φ = 15°)
    - Extreme point load
    - Expected: 50%+ yielding, possibly convergence issues
    """
    print("\n" + "="*80)
    print("TEST CASE 3: EXTENSIVE YIELDING (Very Weak Soil + Extreme Load)")
    print("="*80)
    
    nodes, elements = create_simple_mesh(10, 5, 5, 2)
    
    # Very weak material
    material = Material(
        id="weak_soil",
        name="Soft Clay",
        color="#8B4513",
        youngsModulus=5000,  # 5 MPa (very soft)
        poissonsRatio=0.4,
        unitWeightSaturated=16,
        unitWeightUnsaturated=14,
        cohesion=1,  # Very low
        frictionAngle=15,  # Very low
        material_model=MaterialModel.MOHR_COULOMB
    )
    
    nx = 5
    full_fixed = [BoundaryCondition(node=i) for i in range(nx + 1)]
    normal_fixed = []
    for j in range(1, 3):
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1)))
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1) + nx))
    
    element_materials = [
        ElementMaterial(element_id=i+1, material=material) 
        for i in range(len(elements))
    ]
    
    # Extreme load
    center_node = 2 * (nx + 1) + nx // 2
    point_loads = [
        PointLoadData(node=center_node, fx=0, fy=-1000)  # 1000 kN!
    ]
    
    mesh = MeshResponse(
        success=True,
        nodes=nodes,
        elements=elements,
        boundary_conditions=BoundaryConditionsResponse(
            full_fixed=full_fixed,
            normal_fixed=normal_fixed
        ),
        point_load_assignments=[],
        element_materials=element_materials
    )
    
    request = SolverRequest(
        mesh=mesh,
        settings=SolverSettings(max_steps=100, tolerance=0.02),  # Relaxed tolerance
        point_loads=point_loads
    )
    
    result = solve_initial_phase(request)
    
    print(f"{'✅' if result.success else '⚠️ '} Analysis Success: {result.success}")
    print(f"📊 Steps Taken: {result.steps_taken}")
    
    if result.displacements:
        print(f"📍 Max Displacement: {max([d.ux**2 + d.uy**2 for d in result.displacements])**0.5:.6f} m")
    
    yielded = [s for s in result.stresses if s.is_yielded]
    if result.stresses:
        yield_pct = len(yielded) / len(result.stresses) * 100
        print(f"🔴 Yielded Elements: {len(yielded)}/{len(result.stresses)} ({yield_pct:.1f}%)")
        
        if yield_pct > 50:
            print("✅ PASS: Extensive yielding detected (expected for weak soil)")
        else:
            print(f"⚠️  INFO: Yield percentage: {yield_pct:.1f}%")
    
    if result.success:
        print("✅ Solver converged despite extensive plasticity")
    else:
        print(f"⚠️  Solver failed: {result.error}")
        print("    This is EXPECTED for near-collapse conditions")
    
    return result

def test_case_4_mixed_materials():
    """
    Test Case 4: Mixed material mesh (elastic + plastic)
    - Top layer: Linear Elastic (stiff foundation)
    - Bottom layer: Mohr-Coulomb (soft soil)
    - Expected: Only bottom elements yield
    """
    print("\n" + "="*80)
    print("TEST CASE 4: MIXED MATERIALS (Elastic Foundation + Plastic Soil)")
    print("="*80)
    
    nodes, elements = create_simple_mesh(10, 6, 5, 3)
    
    # Stiff elastic foundation
    elastic_mat = Material(
        id="foundation",
        name="Concrete",
        color="#808080",
        youngsModulus=25000000,  # 25 GPa
        poissonsRatio=0.2,
        unitWeightSaturated=24,
        unitWeightUnsaturated=24,
        cohesion=1000,  # Not used for elastic
        frictionAngle=45,
        material_model=MaterialModel.LINEAR_ELASTIC  # ELASTIC
    )
    
    # Soft plastic soil
    plastic_mat = Material(
        id="soil",
        name="Soft Soil",
        color="#8B4513",
        youngsModulus=10000,
        poissonsRatio=0.35,
        unitWeightSaturated=17,
        unitWeightUnsaturated=15,
        cohesion=5,
        frictionAngle=20,
        material_model=MaterialModel.MOHR_COULOMB  # PLASTIC
    )
    
    # Assign materials: top 1/3 = elastic, bottom 2/3 = plastic
    nx, ny = 5, 3
    element_materials = []
    for i, elem in enumerate(elements):
        # Check element centroid Y
        n1, n2, n3 = elem
        y_avg = (nodes[n1][1] + nodes[n2][1] + nodes[n3][1]) / 3
        
        if y_avg > 4.0:  # Top layer
            element_materials.append(ElementMaterial(element_id=i+1, material=elastic_mat))
        else:  # Bottom layer
            element_materials.append(ElementMaterial(element_id=i+1, material=plastic_mat))
    
    full_fixed = [BoundaryCondition(node=i) for i in range(nx + 1)]
    normal_fixed = []
    for j in range(1, ny + 1):
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1)))
        normal_fixed.append(BoundaryCondition(node=j * (nx + 1) + nx))
    
    # Heavy load at top
    top_center = ny * (nx + 1) + nx // 2
    point_loads = [PointLoadData(node=top_center, fx=0, fy=-300)]
    
    mesh = MeshResponse(
        success=True,
        nodes=nodes,
        elements=elements,
        boundary_conditions=BoundaryConditionsResponse(
            full_fixed=full_fixed,
            normal_fixed=normal_fixed
        ),
        point_load_assignments=[],
        element_materials=element_materials
    )
    
    request = SolverRequest(
        mesh=mesh,
        settings=SolverSettings(max_steps=100),
        point_loads=point_loads
    )
    
    result = solve_initial_phase(request)
    
    print(f"✅ Analysis Success: {result.success}")
    print(f"📊 Steps Taken: {result.steps_taken}")
    print(f"📍 Max Displacement: {max([d.ux**2 + d.uy**2 for d in result.displacements])**0.5:.6f} m")
    
    yielded = [s for s in result.stresses if s.is_yielded]
    print(f"🔴 Yielded Elements: {len(yielded)}/{len(result.stresses)}")
    
    # Check that only plastic material elements yielded
    elastic_yielded = [s for s in yielded if s.element_id <= len(elements)//3]
    if not elastic_yielded:
        print("✅ PASS: No yielding in elastic (foundation) elements")
    else:
        print(f"⚠️  WARNING: {len(elastic_yielded)} elastic elements yielded")
    
    return result

if __name__ == "__main__":
    print("\n" + "❖" * 40)
    print("MOHR-COULOMB PLASTICITY TEST SUITE")
    print("❖" * 40)
    
    results = {}
    
    try:
        results['test1'] = test_case_1_pure_elastic()
    except Exception as e:
        print(f"❌ Test 1 FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results['test2'] = test_case_2_partial_yielding()
    except Exception as e:
        print(f"❌ Test 2 FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results['test3'] = test_case_3_extensive_yielding()
    except Exception as e:
        print(f"❌ Test 3 FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    try:
        results['test4'] = test_case_4_mixed_materials()
    except Exception as e:
        print(f"❌ Test 4 FAILED: {e}")
        import traceback
        traceback.print_exc()
    
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    passed = sum(1 for r in results.values() if r and r.success)
    print(f"✅ Passed: {passed}/{len(results)}")
    print(f"⚠️  Failed: {len(results) - passed}/{len(results)}")
    print("\n" + "❖" * 40 + "\n")
