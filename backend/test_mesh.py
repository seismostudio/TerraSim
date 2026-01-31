import requests
import json

def test_mesh_generation():
    url = "http://localhost:8000/api/mesh/generate"
    
    payload = {
        "polygons": [
            {
                "vertices": [{"x": 0, "y": 0}, {"x": 10, "y": 0}, {"x": 10, "y": 10}, {"x": 0, "y": 10}],
                "mesh_size": 1.0,
                "boundary_refinement_factor": 1.0,
                "materialId": "mat1"
            }
        ],
        "materials": [
            {
                "id": "mat1",
                "name": "Soil 1",
                "color": "#ff0000",
                "youngsModulus": 10000,
                "poissonsRatio": 0.3,
                "unitWeightSaturated": 20,
                "unitWeightUnsaturated": 18,
                "cohesion": 10,
                "frictionAngle": 30,
                "thickness": 1,
                "permeability": 1e-5,
                "voidRatio": 0.5,
                "specificGravity": 2.7
            }
        ],
        "pointLoads": []
    }
    
    print("Sending request...")
    try:
        response = requests.post(url, json=payload)
        response.raise_for_status()
        data = response.json()
        
        if data['success']:
            print("SUCCESS: Mesh generated!")
            print(f"Nodes: {len(data['nodes'])}")
            print(f"Elements: {len(data['elements'])}")
            print(f"Element Materials: {len(data['element_materials'])}")
            print(f"Boundary Conditions: {len(data['boundary_conditions']['full_fixed'])} fixed, {len(data['boundary_conditions']['normal_fixed'])} normal")
            
            # Simple check
            if len(data['nodes']) > 0 and len(data['elements']) > 0:
                print("Test Passed: Basic mesh output verified.")
            else:
                print("Test Failed: Empty mesh.")
        else:
            print(f"FAILED: {data.get('error')}")
            
    except Exception as e:
        print(f"Error: {e}")
        if 'response' in locals():
            print(response.text)

if __name__ == "__main__":
    test_mesh_generation()
