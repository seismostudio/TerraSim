# Mesh Generation Module

This module implements unstructured Delaunay triangulation with boundary refinement for generating triangular meshes from polygon data.

## Features

- **Unstructured Delaunay Triangulation**: Generates high-quality triangular meshes
- **Boundary Refinement**: Creates finer mesh elements near boundaries for better accuracy
- **Polygon Support**: Handles complex polygons with holes
- **Mesh Quality Analysis**: Provides quality metrics and visualization
- **File I/O**: Save and load mesh data

## Files

### Core Modules

1. **`input_data.py`** - Contains the `Polygon` class with sample polygon data
2. **`mesh_generator.py`** - Main mesh generation engine using Delaunay triangulation
3. **`mesh_visualizer.py`** - Visualization tools for mesh analysis
4. **`mesh_demo.py`** - Comprehensive demonstration script
5. **`run_mesh_generation.py`** - Simple script for mesh generation
6. **`test_mesh.py`** - Test suite for validation

## Usage

### Basic Usage

```python
from input_data import load_input_data
from mesh_generator import MeshGenerator
from mesh_visualizer import MeshVisualizer

# Load polygon data
geometry, material, boundary_conditions, polygon = load_input_data()

# Create mesh generator
mesh_generator = MeshGenerator(polygon)

# Generate mesh
nodes, elements, boundary_nodes = mesh_generator.generate_mesh()

# Create visualizer
visualizer = MeshVisualizer(mesh_generator)

# Save mesh data
mesh_generator.save_mesh_to_file('mesh.npz')

# Generate visualizations
visualizer.save_mesh_plot('mesh.png', 'mesh')
visualizer.save_mesh_plot('quality.png', 'quality')
```

### Running the Demo

```bash
# Run the full demo (includes interactive plots)
python mesh_demo.py

# Run simple mesh generation (no interactive plots)
python run_mesh_generation.py

# Run tests
python test_mesh.py
```

## Polygon Data Structure

The `Polygon` class contains:

```python
class Polygon:
    def __init__(self):
        # Vertices [x, y] coordinates
        self.vertices = np.array([
            # Outer boundary (counter-clockwise)
            [0.0, 0.0],   # 0
            [10.0, 0.0],  # 1
            [10.0, 8.0],  # 2
            [0.0, 8.0],   # 3
            
            # Inner boundary (hole) - clockwise
            [3.0, 3.0],   # 4
            [7.0, 3.0],   # 5
            [7.0, 5.0],   # 6
            [3.0, 5.0],   # 7
        ])
        
        # Boundary segments [start_vertex, end_vertex]
        self.boundary_segments = np.array([
            # Outer boundary
            [0, 1], [1, 2], [2, 3], [3, 0],
            # Inner boundary (hole)
            [4, 5], [5, 6], [6, 7], [7, 4]
        ])
        
        # Boundary types: 0 = outer boundary, 1 = inner boundary (hole)
        self.boundary_types = np.array([0, 0, 0, 0, 1, 1, 1, 1])
        
        # Mesh parameters
        self.mesh_size = 0.5  # Target element size
        self.boundary_refinement_factor = 0.3  # Smaller elements near boundaries
```

## Mesh Generation Process

1. **Boundary Point Generation**: Creates refined points along polygon boundaries
2. **Interior Point Generation**: Generates interior points using regular grid approach
3. **Delaunay Triangulation**: Performs triangulation on all points
4. **Triangle Filtering**: Removes triangles outside the polygon domain
5. **Boundary Node Identification**: Identifies nodes on or near boundaries

## Mesh Quality Metrics

The module provides several quality metrics:

- **Aspect Ratio**: Ratio of longest to shortest edge (lower is better)
- **Element Area**: Area of each triangular element
- **Boundary Refinement**: Concentration of elements near boundaries

## Visualization Options

The `MeshVisualizer` class provides multiple visualization types:

1. **`boundary`**: Original polygon boundary
2. **`mesh`**: Generated mesh with nodes and elements
3. **`quality`**: Mesh quality analysis with color-coded elements
4. **`statistics`**: Comprehensive statistics panel

## Output Files

When running the mesh generation, the following files are created:

- **`generated_mesh.npz`**: Mesh data (nodes, elements, boundary nodes)
- **`polygon_boundary.png`**: Original polygon visualization
- **`generated_mesh.png`**: Mesh visualization
- **`mesh_quality.png`**: Quality analysis plot
- **`mesh_statistics.png`**: Comprehensive statistics

## Customization

### Creating Custom Polygons

```python
from input_data import Polygon
import numpy as np

# Create custom polygon
polygon = Polygon()
polygon.vertices = np.array([
    # Outer boundary
    [0.0, 0.0], [5.0, 0.0], [5.0, 3.0], [0.0, 3.0],
    # Inner boundary (hole)
    [1.0, 1.0], [4.0, 1.0], [4.0, 2.0], [1.0, 2.0]
])

# Adjust mesh parameters
polygon.mesh_size = 0.3  # Smaller elements
polygon.boundary_refinement_factor = 0.2  # More refinement
```

### Mesh Parameters

- **`mesh_size`**: Target element size (smaller = finer mesh)
- **`boundary_refinement_factor`**: Boundary refinement factor (smaller = more refinement)

## Dependencies

- `numpy`: Numerical computations
- `scipy`: Delaunay triangulation
- `matplotlib`: Visualization

## Algorithm Details

### Delaunay Triangulation

The module uses SciPy's Delaunay triangulation algorithm, which ensures:
- No triangle contains any other triangle's circumcenter
- Maximizes minimum angle in triangles
- Provides optimal mesh quality

### Boundary Refinement

Boundary refinement is achieved by:
1. Generating more points along boundary segments
2. Using smaller mesh size near boundaries
3. Identifying boundary nodes for special treatment

### Point-in-Polygon Testing

Uses ray casting algorithm to determine if points are inside the polygon domain, handling both outer boundaries and holes.

## Performance Considerations

- Mesh generation time scales with the number of points
- Larger domains require more memory
- Boundary refinement increases computational cost
- Quality analysis adds visualization overhead

## Troubleshooting

### Common Issues

1. **"index out of bounds"**: Ensure polygon has both outer and inner boundaries
2. **Poor mesh quality**: Reduce mesh size or adjust boundary refinement
3. **Memory issues**: Increase mesh size for large domains
4. **Visualization errors**: Check matplotlib backend configuration

### Validation

Run the test suite to validate functionality:

```bash
python test_mesh.py
```

This will test:
- Basic mesh generation
- Visualization functionality
- File I/O operations
- Custom polygon handling 