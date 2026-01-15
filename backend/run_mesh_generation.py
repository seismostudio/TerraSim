"""
Simple mesh generation script without interactive plots
"""

from input_data import load_input_data
from mesh_generator import MeshGenerator
from mesh_visualizer import MeshVisualizer

def main():
    """
    Generate mesh and save visualizations without interactive plots
    """
    print("=== Mesh Generation and Visualization ===")
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
    mesh_generator.save_mesh_to_file('generated_mesh.npz')
    
    # Create and save various plots
    print("\nCreating visualization plots...")
    
    # 1. Original polygon boundary
    visualizer.save_mesh_plot('polygon_boundary.png', 'boundary')
    
    # 2. Generated mesh
    visualizer.save_mesh_plot('generated_mesh.png', 'mesh')
    
    # 3. Mesh quality
    visualizer.save_mesh_plot('mesh_quality.png', 'quality')
    
    # 4. Comprehensive statistics
    visualizer.save_mesh_plot('mesh_statistics.png', 'statistics')
    
    print("\nAll plots saved successfully!")
    print("\nGenerated files:")
    print("- generated_mesh.npz (mesh data)")
    print("- polygon_boundary.png (original polygon)")
    print("- generated_mesh.png (mesh visualization)")
    print("- mesh_quality.png (mesh quality analysis)")
    print("- mesh_statistics.png (comprehensive statistics)")
    
    return mesh_generator, visualizer

if __name__ == "__main__":
    main() 