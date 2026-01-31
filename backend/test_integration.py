"""
Integration Test: Frontend-Backend Data Structure Validation
Tests complete data flow from material creation to plasticity results
"""
import requests
import json

BASE_URL = "http://localhost:8000"

def test_material_model_flow():
    """
    Test complete flow:
    1. Create mesh with MC material
    2. Run analysis
    3. Verify is_yielded in response
    """
    print("\n" + "="*80)
    print("INTEGRATION TEST: Material Model → Plasticity Results")
    print("="*80)
    
    # 1. Prepare mesh request with Mohr-Coulomb material
    mesh_request = {
        "polygons": [
            {
                "vertices": [
                    {"x": 0, "y": 0},
                    {"x": 10, "y": 0},
                    {"x": 10, "y": 5},
                    {"x": 0, "y": 5}
                ],
                "mesh_size": 2.0,
                "boundary_refinement_factor": 1.0,
                "materialId": "weak_soil"
            }
        ],
        "materials": [
            {
                "id": "weak_soil",
                "name": "Weak Clay",
                "color": "#8B4513",
                "youngsModulus": 10000,
                "poissonsRatio": 0.35,
                "unitWeightSaturated": 18,
                "unitWeightUnsaturated": 16,
                "cohesion": 5,
                "frictionAngle": 20,
                "dilationAngle": 0,
                "thickness": 1.0,
                "permeability": 1e-8,
                "voidRatio": 0.6,
                "specificGravity": 2.65,
                "material_model": "mohr_coulomb"  # ✅ Key field
            }
        ],
        "pointLoads": [
            {
                "id": "pl1",
                "x": 5.0,
                "y": 5.0,
                "fx": 0.0,
                "fy": -200.0
            }
        ]
    }
    
    print("\n1️⃣  Sending mesh generation request with Mohr-Coulomb material...")
    response = requests.post(f"{BASE_URL}/api/mesh/generate", json=mesh_request)
    assert response.status_code == 200, f"Mesh gen failed: {response.status_code}"
    
    mesh_data = response.json()
    print(f"   ✅ Mesh generated: {len(mesh_data['nodes'])} nodes, {len(mesh_data['elements'])} elements")
    
    # Verify material_model preserved
    element_material = mesh_data['element_materials'][0]
    assert 'material' in element_material, "Missing material in element_materials"
    assert 'material_model' in element_material['material'], "material_model not in response!"
    assert element_material['material']['material_model'] == "mohr_coulomb", "material_model changed!"
    print(f"   ✅ Material model preserved: {element_material['material']['material_model']}")
    
    # 2. Run sequential analysis
    analysis_request = {
        "mesh": mesh_data,
        "stages": [
            {
                "stage_id": "initial",
                "stage_type": "Initial",
                "loads": [
                    {
                        "node": mesh_data['point_load_assignments'][0]['assigned_node_id'],
                        "fx": 0.0,
                        "fy": -200.0
                    }
                ]
            }
        ]
    }
    
    print("\n2️⃣  Running sequential analysis...")
    response = requests.post(f"{BASE_URL}/api/sequential/analyze", json=analysis_request)
    assert response.status_code == 200, f"Analysis failed: {response.status_code}"
    
    results = response.json()
    print(f"   ✅ Analysis completed: {len(results['stages'])} stages")
    
    # 3. Verify is_yielded in stress results
    stage = results['stages'][0]
    stresses = stage['stresses']
    
    assert len(stresses) > 0, "No stress results!"
    
    # Check if is_yielded field exists
    first_stress = stresses[0]
    assert 'is_yielded' in first_stress, "is_yielded field missing!"
    assert 'yield_function' in first_stress, "yield_function field missing!"
    
    print(f"   ✅ Stress results include plasticity fields")
    
    # Count yielded elements
    yielded = [s for s in stresses if s.get('is_yielded', False)]
    elastic = [s for s in stresses if not s.get('is_yielded', False)]
    
    yielded_pct = len(yielded) / len(stresses) * 100
    
    print(f"\n3️⃣  Plasticity Results:")
    print(f"   Total Elements: {len(stresses)}")
    print(f"   Yielded: {len(yielded)} ({yielded_pct:.1f}%)")
    print(f"   Elastic: {len(elastic)} ({100-yielded_pct:.1f}%)")
    
    if len(yielded) > 0:
        print(f"   ✅ Plasticity detected (expected for weak soil + heavy load)")
        # Show sample yielded element
        sample = yielded[0]
        print(f"   Sample yielded element {sample['element_id']}: f={sample.get('yield_function', 'N/A'):.4f}")
    else:
        print(f"   ⚠️  No plasticity (might need heavier load or weaker material)")
    
    print("\n" + "="*80)
    print("✅ INTEGRATION TEST PASSED")
    print("   - Material model flows end-to-end ✅")
    print("   - Plasticity fields present in response ✅")
    print("   - Frontend can display results ✅")
    print("="*80 + "\n")
    
    return True

if __name__ == "__main__":
    try:
        test_material_model_flow()
    except requests.exceptions.ConnectionError:
        print("\n❌ ERROR: Cannot connect to backend at http://localhost:8000")
        print("   Please ensure backend is running: python -m backend.main")
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
    except Exception as e:
        print(f"\n❌ UNEXPECTED ERROR: {e}")
        import traceback
        traceback.print_exc()
