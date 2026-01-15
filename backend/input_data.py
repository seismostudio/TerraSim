"""
Input Data Module for CST FEA Analysis - Soil Analysis
Contains geometry, soil properties, and boundary conditions for geotechnical analysis
"""

import numpy as np

# Polygon Data for Mesh Generation
class Polygon:
    def __init__(self):
        # Sample polygon vertices [x, y] in meters
        self.vertices = np.array([
            # Outer boundary (counter-clockwise)
            [0.0, 0.0],   # 0
            [10.0, 0.0],  # 1
            [10.0, 10.0],  # 2
            [8.0, 10.0],  # 3
            [7.0, 8.0],   # 4
            [0.0, 8.0],   # 5
            
            # Inner boundary (hole) - clockwise
            [3.0, 3.0],   # 6
            [6.0, 3.0],   # 7
            [6.0, 5.0],   # 8
            [3.0, 5.0],   # 9
        ])
        
        # Boundary segments [start_vertex, end_vertex]
        self.boundary_segments = np.array([
            # Outer boundary (counter-clockwise)
            [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0],
            # Inner boundary (hole) - clockwise
            [6, 7], [7, 8], [8, 9], [9, 6]
        ])
        
        # Boundary types: 0 = outer boundary, 1 = inner boundary (hole)
        self.boundary_types = np.array([0, 0, 0, 0, 0, 0, 1, 1, 1, 1])
        
        # Mesh parameters
        self.mesh_size = 0.5  # Target element size
        self.boundary_refinement_factor = 0.3  # Smaller elements near boundaries
        
    def get_outer_boundary(self):
        """Get outer boundary vertices"""
        return self.vertices[:6]  # 6 vertices for outer boundary
    
    def get_inner_boundary(self):
        """Get inner boundary vertices (holes)"""
        return self.vertices[6:10]  # 4 vertices for inner boundary (hole)
    
    def get_all_boundaries(self):
        """Get all boundary vertices"""
        return self.vertices

# Geometry Data
class Geometry:
    def __init__(self, nodes=None, elements=None, element_active=None):
        if nodes is not None and elements is not None:
            # ✅ Constructor with custom nodes and elements
            self.nodes = np.array(nodes)
            self.elements = np.array(elements)
            self.num_nodes = len(self.nodes)
            self.num_elements = len(self.elements)
            
            # ✅ NEW: Initialize element_active array
            if element_active is not None:
                self.element_active = np.array(element_active, dtype=bool)
            else:
                # Default: all elements are active
                self.element_active = np.ones(self.num_elements, dtype=bool)
        else:
            # Default constructor with predefined geometry
            # Node coordinates [x, y] in meters
            self.nodes = np.array([
                [0.0, 0.0], # 0 Node 1
                [0.5, 0.0], # 1 Node 2
                [1.0, 0.0], # 2 Node 3
                [1.5, 0.0], # 3 Node 4
                [2.0, 0.0], # 4 Node 5
                [2.5, 0.0], # 5 Node 6
                [3.0, 0.0], # 6 Node 7
                [3.5, 0.0], # 7 Node 8
                [4.0, 0.0], # 8 Node 9
                [0.0, 0.5], # 9 Node 10
                [0.5, 0.5], # 10 Node 11
                [1.0, 0.5], # 11 Node 12
                [1.5, 0.5], # 12 Node 13
                [2.0, 0.5], # 13 Node 14
                [2.5, 0.5], # 14 Node 15
                [3.0, 0.5], # 15 Node 16
                [3.5, 0.5], # 16 Node 17
                [4.0, 0.5], # 17 Node 18
                [0.0, 1.0], # 18 Node 19
                [0.5, 1.0], # 19 Node 20
                [1.0, 1.0], # 20 Node 21
                [1.5, 1.0], # 21 Node 22
                [2.0, 1.0], # 22 Node 23
                [2.5, 1.0], # 23 Node 24
                [3.0, 1.0], # 24 Node 25
                [3.5, 1.0], # 25 Node 26
                [4.0, 1.0], # 26 Node 27
                [0.0, 1.5], # 27 Node 28
                [0.5, 1.5], # 28 Node 29
                [1.0, 1.5], # 29 Node 30
                [1.5, 1.5], # 30 Node 31
                [2.0, 1.5], # 31 Node 32
                [2.5, 1.5], # 32 Node 33
                [3.0, 1.5], # 33 Node 34
                [3.5, 1.5], # 34 Node 35
                [4.0, 1.5], # 35 Node 36
                [0.0, 2.0], # 36 Node 37
                [0.5, 2.0], # 37 Node 38
                [1.0, 2.0], # 38 Node 39
                [1.5, 2.0], # 39 Node 40
                [2.0, 2.0], # 40 Node 41
                [2.5, 2.0], # 41 Node 42
                [3.0, 2.0], # 42 Node 43
                [3.5, 2.0], # 43 Node 44
                [4.0, 2.0], # 44 Node 45
                [2.5, 2.5], # 45 Node 46
                [3.0, 2.5], # 46 Node 47
                [3.5, 2.5], # 47 Node 48
                [4.0, 2.5] # 48 Node 49
            ])
            
            # Element connectivity [node1, node2, node3] (1-based indexing)
            self.elements = np.array([
            #row 1
            [1, 2, 10], # 1 Element 1
            [2, 11, 10], # 2 Element 2
            [2, 12, 11], # 3 Element 3
            [2, 3, 12], # 4 Element 4
            [3, 4, 12], # 5 Element 5
            [4, 13, 12], # 6 Element 6
            [4, 14, 13], # 7 Element 7
            [4, 5, 14], # 8 Element 8
            [5, 6, 14], # 9 Element 9
            [6, 15, 14], # 10 Element 10
            [6, 16, 15], # 11 Element 11
            [6, 7, 16], # 12 Element 12
            [7, 8, 16], # 13 Element 13
            [8, 17, 16], # 14 Element 14
            [8, 18, 17], # 15 Element 15
            [8, 9, 18], # 16 Element 16

            #row 2
            [10, 11, 19], # 17 Element 17
            [11, 20, 19], # 18 Element 18
            [11, 21, 20], # 19 Element 19
            [11, 12, 21], # 20 Element 20
            [12, 13, 21], # 21 Element 21
            [13, 22, 21], # 22 Element 22
            [13, 23, 22], # 23 Element 23
            [13, 14, 23], # 24 Element 24
            [14, 15, 23], # 25 Element 25
            [15, 24, 23], # 26 Element 26
            [15, 25, 24], # 27 Element 27
            [15, 16, 25], # 28 Element 28
            [16, 17, 25], # 29 Element 29
            [17, 26, 25], # 30 Element 30
            [17, 27, 26], # 31 Element 31
            [17, 18, 27], # 32 Element 32

            #row 3
            [19, 20, 28], # 33 Element 33
            [20, 29, 28], # 34 Element 34
            [20, 30, 29], # 35 Element 35
            [20, 21, 30], # 36 Element 36
            [21, 22, 30], # 37 Element 37
            [22, 31, 30], # 38 Element 38
            [22, 32, 31], # 39 Element 39
            [22, 23, 32], # 40 Element 40
            [23, 24, 32], # 41 Element 41
            [24, 33, 32], # 42 Element 42
            [24, 34, 33], # 43 Element 43
            [24, 25, 34], # 44 Element 44
            [25, 26, 34], # 45 Element 45
            [26, 35, 34], # 46 Element 46
            [26, 36, 35], # 47 Element 47
            [26, 27, 36], # 48 Element 48

            #row 4
            [28, 29, 37], # 49 Element 49
            [29, 38, 37], # 50 Element 50
            [29, 39, 38], # 51 Element 51
            [29, 30, 39], # 52 Element 52
            [30, 31, 39], # 53 Element 53
            [31, 40, 39], # 54 Element 54
            [31, 41, 40], # 55 Element 55
            [31, 32, 41], # 56 Element 56
            [32, 33, 41], # 57 Element 57
            [33, 42, 41], # 58 Element 58
            [33, 43, 42], # 59 Element 59
            [33, 34, 43], # 60 Element 60
            [34, 35, 43], # 61 Element 61
            [35, 44, 43], # 62 Element 62
            [35, 45, 44], # 63 Element 63
            [35, 36, 45], # 64 Element 64

            #row 5
            [41, 42, 46], # 65 Element 65
            [42, 43, 46], # 66 Element 66
            [43, 47, 46], # 67 Element 67
            [43, 48, 47], # 68 Element 68
            [43, 44, 48], # 69 Element 69
            [44, 45, 48], # 70 Element 70
            [45, 48, 49], # 71 Element 71
            ])
            
            self.num_nodes = len(self.nodes)
            self.num_elements = len(self.elements)
            
            # ✅ NEW: Initialize element_active array - all elements active by default
            self.element_active = np.ones(self.num_elements, dtype=bool)
    
    def set_element_active(self, element_indices, active_status):
        """
        Set active status for specific elements
        
        Parameters:
        element_indices: List or array of element indices (0-based)
        active_status: Boolean or array of booleans
        """
        if isinstance(element_indices, (list, np.ndarray)):
            self.element_active[element_indices] = active_status
        else:
            self.element_active[element_indices] = active_status
    
    def get_active_elements(self):
        """
        Get indices of active elements
        
        Returns:
        np.ndarray: Array of active element indices
        """
        return np.where(self.element_active)[0]
    
    def get_inactive_elements(self):
        """
        Get indices of inactive elements
        
        Returns:
        np.ndarray: Array of inactive element indices
        """
        return np.where(~self.element_active)[0]

# Soil Properties
class Material:
    def __init__(self):
        # Soil properties for clay
        self.young_modulus = 30000.0  # kN/m² (50 MPa)
        self.poisson_ratio = 0.3     # Typical for clay
        self.unit_weight_saturated = 22.0       # kN/m³ (saturated)
        self.unit_weight_unsaturated = 20.0     # kN/m³ (unsaturated)
        self.cohesion = 50.0          # kN/m²
        self.friction_angle = 25.0    # degrees
        self.thickness = 1.0          # m (plane strain)
        
        # Additional soil parameters
        self.permeability = 1e-8      # m/s (low permeability for clay)
        self.void_ratio = 0.8         # e
        self.specific_gravity = 2.7   # Gs

# Boundary Conditions
class BoundaryConditions:
    def __init__(self):
        # Fixed nodes (0-based indexing) - bottom boundary
        self.fixed_nodes = [0, 1, 2, 3, 4, 5, 6, 7, 8]  # Bottom nodes are fixed
        self.normal_fixed_nodes = [9, 19, 27, 36, 17, 26, 35, 44, 48]  # Normal nodes are fixed
        
        # Applied forces [node_id, fx, fy] in kN (0-based indexing)
        self.applied_forces = np.array([
            [45, 0.0, -150.0],
            [46, 0.0, -150.0],
            [47, 0.0, -150.0],
            [48, 0.0, -150.0]
        ])
        
        # Gravity loads (self-weight of soil)
        self.gravity_loads = True
        
        # Water table level (m from bottom)
        self.water_table = 1.5     # m
        
        # Foundation pressure (kN/m²)
        self.foundation_pressure = 200.0  # kN/m²
    
    def add_full_fixed(self, node_id):
        """Add a node with full fixed boundary condition (both x and y directions)"""
        if node_id not in self.fixed_nodes:
            self.fixed_nodes.append(node_id)
    
    def add_normal_fixed(self, node_id):
        """Add a node with normal fixed boundary condition (only y direction)"""
        if node_id not in self.normal_fixed_nodes:
            self.normal_fixed_nodes.append(node_id)
    
    def add_load(self, node_id, fx, fy):
        """Add a load to a specific node"""
        new_load = np.array([[node_id, fx, fy]])
        self.applied_forces = np.vstack([self.applied_forces, new_load])
    
    def get_fixed_nodes(self):
        """Get all fixed nodes"""
        return self.fixed_nodes
    
    def get_normal_fixed_nodes(self):
        """Get all normal fixed nodes"""
        return self.normal_fixed_nodes
    
    def get_applied_forces(self):
        """Get all applied forces"""
        return self.applied_forces

# Load the data
def load_input_data():
    """Load all input data for the soil FEA analysis"""
    geometry = Geometry()
    material = Material()
    boundary_conditions = BoundaryConditions()
    polygon = Polygon()
    
    return geometry, material, boundary_conditions, polygon 