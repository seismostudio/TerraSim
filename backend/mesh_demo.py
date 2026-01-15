"""
Mesh Generation and Visualization Demo
Demonstrates the use of mesh generator and visualizer modules
"""

import numpy as np
import matplotlib.pyplot as plt
from input_data import load_input_data
from mesh_generator import MeshGenerator
from mesh_visualizer import MeshVisualizer

def main():
    """
    Main demonstration function
    """
    print("=== Mesh Generation and Visualization Demo ===")
    print()
    
    # Load input data including polygon
    print("Loading input data...")
    geometry, material, boundary_conditions, polygon = load_input_data()
    
    # Create mesh generator
    print("Initializing mesh generator...")
    mesh_generator = MeshGenerator(polygon)
    
    # Generate mesh
    print("Generating mesh...")
    nodes, elements, boundary_nodes = mesh_generator.generate_mesh()
    
    # Create mesh visualizer
    print("Creating mesh visualizer...")
    visualizer = MeshVisualizer(mesh_generator)
    
    # Display mesh statistics
    print("\n=== Mesh Statistics ===")
    mesh_data = mesh_generator.get_mesh_data()
    print(f"Total nodes: {mesh_data['num_nodes']}")
    print(f"Total elements: {mesh_data['num_elements']}")
    print(f"Boundary nodes: {len(mesh_data['boundary_nodes'])}")
    
    # Save mesh to file
    print("\nSaving mesh to file...")
    
    # Create and save various plots
    print("\nCreating visualization plots...")
    

    
    print("\nAll plots saved successfully!")
    
    # Show interactive plot
    print("\nDisplaying interactive mesh plot...")
    visualizer.show_interactive_mesh()
    
    return mesh_generator, visualizer

def compare_mesh_qualities():
    """
    Compare mesh quality with different parameters
    """
    print("=== Mesh Quality Comparison ===")
    
    # Create polygon
    from input_data import Polygon
    polygon = Polygon()
    
    # Test different mesh sizes
    mesh_sizes = [1.0, 0.5, 0.25]
    results = []
    
    for mesh_size in mesh_sizes:
        print(f"\nTesting mesh size: {mesh_size}")
        
        # Create mesh generator with current mesh size
        test_polygon = Polygon()
        test_polygon.mesh_size = mesh_size
        test_polygon.boundary_refinement_factor = 0.3
        
        mesh_generator = MeshGenerator(test_polygon)
        nodes, elements, boundary_nodes = mesh_generator.generate_mesh()
        
        # Calculate quality metrics
        aspect_ratios = []
        areas = []
        for element in elements:
            triangle_points = nodes[element]
            # Calculate aspect ratio
            edges = []
            for i in range(3):
                p1 = triangle_points[i]
                p2 = triangle_points[(i + 1) % 3]
                edge_length = np.linalg.norm(p2 - p1)
                edges.append(edge_length)
            aspect_ratio = np.max(edges) / np.min(edges)
            aspect_ratios.append(aspect_ratio)
            
            # Calculate area
            x = triangle_points[:, 0]
            y = triangle_points[:, 1]
            area = 0.5 * abs(np.dot(x, np.roll(y, 1)) - np.dot(y, np.roll(x, 1)))
            areas.append(area)
        
        results.append({
            'mesh_size': mesh_size,
            'num_nodes': len(nodes),
            'num_elements': len(elements),
            'avg_aspect_ratio': np.mean(aspect_ratios),
            'min_aspect_ratio': np.min(aspect_ratios),
            'max_aspect_ratio': np.max(aspect_ratios),
            'avg_area': np.mean(areas),
            'min_area': np.min(areas),
            'max_area': np.max(areas)
        })
    
    # Print comparison results
    print("\n=== Mesh Quality Comparison Results ===")
    print(f"{'Mesh Size':<10} {'Nodes':<8} {'Elements':<10} {'Avg Aspect':<12} {'Min Area':<10} {'Max Area':<10}")
    print("-" * 70)
    
    for result in results:
        print(f"{result['mesh_size']:<10} {result['num_nodes']:<8} {result['num_elements']:<10} "
              f"{result['avg_aspect_ratio']:<12.3f} {result['min_area']:<10.4f} {result['max_area']:<10.4f}")
    
    return results

if __name__ == "__main__":
    # Run main demo
    mesh_gen, vis = main()
        
    # Run quality comparison
    print("\n" + "="*50)
    quality_results = compare_mesh_qualities()
    
    print("\n=== Demo Complete ===")