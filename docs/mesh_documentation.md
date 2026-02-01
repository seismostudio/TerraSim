# Mesh Generation Documentation

This document characterizes the mesh generation process implemented in the TerraSim backend. The system utilizes the `triangle` library for constrained Delaunay triangulation and employs a custom conversion routine to generate high-order 6-node quadratic triangular elements (T6).

## Overview

The mesh generation pipeline consists of three main stages:
1.  **Geometry Discretization**: Converting user-defined polygons and loads into a Planar Straight Line Graph (PSLG).
2.  **Triangulation**: Generating a linear triangular mesh (T3) satisfying quality and area constraints.
3.  **Quadratic Conversion**: Upgrading T3 elements to T6 elements by adding midpoint nodes for improved FEA accuracy.

```mermaid
graph TD
    A[Input Geometry (Polygons, Loads)] --> B{Discretization}
    B --> C[Vertices & Segments]
    C --> D[Triangle Library (T3 Mesh)]
    D --> E{Post-Processing}
    E --> F[T6 Conversion (Midpoints)]
    E --> G[Boundary Conditions]
    F --> H[Load Assignments]
    H --> I[Final Mesh Object]
```

## 1. Geometry Discretization

The input geometry consists of polygons (representing soil layers), point loads, and line loads.

### Vertex Generation
- **Polygons**: Each polygon edge is discretized into segments based on the `target_mesh_size` and `boundary_refinement_factor`.
    - `target_seg_len` = `mesh_size` / `refinement_factor`
    - Points are interpolated along edges to ensure valid connectivity.
- **Loads**:
    - **Point Loads**: Coordinates are added as forced vertices to ensuring a node exists exactly at the load application point.
    - **Line Loads**: Endpoints are added as vertices, and the path is added as a constraint segment.

### Region Attributes
Each polygon defines a "region" identified by a representative point inside it. This point allows the triangulation engine to propagate material properties (Attribute ID) to all generated triangles within that boundary.

## 2. Triangulation

We use Jonathan Shewchuk's `triangle` library via the python wrapper.

**Command attributes used:**
- `p`: Triangulate a Planar Straight Line Graph (PSLG).
- `q`: Quality mesh generation (ensures angles > 20 degrees).
- `a`: Area constraints (limits the maximum area of triangles).
- `A`: Assign attributes to identify which polygon an element belongs to.

## 3. Quadratic Conversion (T3 to T6)

Finite Element Analysis (FEA) performance is significantly improved using quadratic elements. We convert the linear 3-node triangles (T3) into 6-node triangles (T6).

### Algorithm
1.  Iterate through every linear element (nodes $n_1, n_2, n_3$).
2.  For each edge (e.g., $n_1-n_2$), check if a midpoint node already exists in the `edge_midpoint_map`.
3.  If not, create a new node at coordinates $(\frac{x_1+x_2}{2}, \frac{y_1+y_2}{2})$ and store it.
4.  Construct the new 6-node element with indices $[n_1, n_2, n_3, n_{12}, n_{23}, n_{31}]$.

**Ordering Convention:**
Standard ordering is critical for shape functions:
- Nodes 1, 2, 3: Corner nodes.
- Nodes 4, 5, 6: Midpoint nodes (4 between 1-2, 5 between 2-3, 6 between 3-1).

## 4. Assignments

### Boundary Conditions
- **full_fixed ($u_x=0, u_y=0$)**: Assigned to all nodes at `y_min` (Bottom of the model).
- **normal_fixed ($u_x=0$)**: Assigned to all nodes at `x_min` and `x_max` (Sides of the model).

### Line Loads
Line loads are assigned to element edges.
- The algorithm detects element edges that lie collinearly with the defined line load segment.
- A `LineLoadAssignment` maps the load to specific element edge nodes, allowing the solver to integrate the distributed force correctly using 3 nodes.

### Point Loads
Point loads are assigned to the nearest node using a K-Dimensional Tree (`cKDTree`) query for geometric matching.
